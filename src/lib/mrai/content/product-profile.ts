import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Vision-built product profile. Takes the workspace's product photos
 * (asset_type='product' from brand library), runs ONE Claude Vision
 * call over them, and produces a category-agnostic structured card
 * that all downstream LLM prompts consume.
 *
 * Why: hardcoding shoe-specific language ("tongue / heel patch") into
 * image-gen breaks for any non-footwear workspace. The profile lets
 * the same pipeline serve cosmetics, apparel, electronics, food, etc.
 *
 * Build trigger:
 *   - First image generation if profile is missing AND ≥1 product photo
 *   - Manual "rebuild" button on the panel
 *   - When new product photos are uploaded (auto-stale check)
 */

export type ProductCategory =
  | "footwear"
  | "apparel"
  | "cosmetics"
  | "skincare"
  | "fragrance"
  | "accessories"
  | "jewelry"
  | "electronics"
  | "home_goods"
  | "food_beverage"
  | "health_supplements"
  | "saas_digital"
  | "ip_media"
  | "other";

export type ProductProfile = {
  workspace_id: string;
  category: ProductCategory;
  description: string | null;
  visual_features: {
    silhouette?: string;
    materials?: string[];
    colors?: string[];
    distinguishing?: string[];
    /** What the product is NOT — used as negative guidance for image
     * generation so the model doesn't drift toward similar-category
     * products with different details (e.g. "no laces", "no perforations",
     * "not a derby"). */
    not_features?: string[];
    typical_angles?: string[];
    /** True only when at least one reference photo clearly shows a
     * brand logo on the product surface. Drives whether image-gen
     * forces a logo into generated images (avoids fake branding when
     * the real product is unbranded). */
    logo_visible_on_product?: boolean;
  };
  logo_placement_hints: string[];
  built_from_asset_ids: string[];
  built_at: string | null;
  build_cost_usd: number | null;
};

const SYSTEM = `You analyze a brand's product photos and produce a structured product card so downstream content tools (copywriting, image generation, logo placement) know exactly what the product is.

You will see 1-5 reference photos of the same product (or product line). Extract:

1. CATEGORY — pick ONE from the controlled list:
   footwear · apparel · cosmetics · skincare · fragrance · accessories · jewelry · electronics · home_goods · food_beverage · health_supplements · saas_digital · ip_media · other

2. DESCRIPTION — 50-200 char plain-text product spec ("white slip-on sneaker with cream felted wool upper, velcro strap, cream rubber sole, small Le Mouton label on side").

3. VISUAL_FEATURES — structured visual signature:
   - silhouette: 1 sentence describing the overall shape/form
   - materials: 1-4 material names ("felted wool", "rubber", "suede")
   - colors: 1-4 dominant colors WITH HEX CODE — sample the actual pixel hex from each photo, do NOT use a generic palette name. Format MUST be "name (#XXXXXX)". Examples: "cream off-white (#F2EADA)", "warm beige (#D9B98C)", "deep navy (#1F2A44)". Multiple shades of the same family → list separately. Hex codes drive image-gen prompts so accuracy matters.
   - distinguishing: 1-3 features that differentiate this product ("velcro strap", "side embroidered label")
   - typical_angles: 1-3 angles that look good in marketing ("3/4 side", "top-down", "feet-walking")
   - NOT_FEATURES: 3-5 features the product DOES NOT have but which similar products in the same category MIGHT have (used as negative guidance for image generation). For footwear examples: ["no laces (slip-on with velcro)", "no perforated upper", "not a derby/oxford", "no leather"]. For apparel: ["no buttons", "not oversized", "no collar"]. Be specific so the image generator knows what to avoid.

4. LOGO_VISIBLE_ON_PRODUCT — boolean. true ONLY if a brand logo is clearly visible on the product surface in at least one reference photo. If logo is absent / hidden / unclear in all photos, return false. This drives whether downstream image generation forces a logo onto generated images (we don't want fake branding when the real product is unbranded).

5. LOGO_PLACEMENT_HINTS — 2-4 phrases describing where on the product the brand logo naturally sits IF visible in references, category-appropriate:
   - footwear: ["shoe tongue", "side panel", "heel patch"]
   - apparel: ["left chest", "sleeve cuff", "hem tag"]
   - cosmetics/skincare: ["front label", "cap", "bottom"]
   - electronics: ["body panel", "back plate", "screen bezel"]
   - food: ["front label", "cap", "side panel"]
   - etc.
   If LOGO_VISIBLE_ON_PRODUCT is false, return empty array.

Be specific and concise — these strings are passed to other LLMs verbatim.

Output JSON ONLY, no prose:
{
  "category": "...",
  "description": "...",
  "visual_features": {
    "silhouette": "...",
    "materials": ["..."],
    "colors": ["..."],
    "distinguishing": ["..."],
    "not_features": ["..."],
    "typical_angles": ["..."],
    "logo_visible_on_product": true | false
  },
  "logo_placement_hints": ["..."]
}`;

async function imageToBase64Downsized(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Downsize for cheaper vision call
    const out = await sharp(buf)
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

export async function buildProductProfile(
  workspaceId: string,
): Promise<{ profile: ProductProfile | null; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { profile: null, error: "ANTHROPIC_API_KEY not set" };
  }

  const svc = createServiceClient();
  const { data: rows } = await svc
    .from("mrai_brand_assets")
    .select("id, image_url, asset_type, label")
    .eq("workspace_id", workspaceId)
    .eq("asset_type", "product")
    .order("created_at", { ascending: true })
    .limit(5);

  const assets = (rows ?? []) as Array<{ id: string; image_url: string; label: string | null }>;
  if (assets.length === 0) {
    return { profile: null, error: "no product assets uploaded" };
  }

  // Fetch + downsize references
  const imageBlocks: Array<{
    type: "image";
    source: { type: "base64"; media_type: "image/png"; data: string };
  }> = [];
  const usedIds: string[] = [];
  for (const a of assets) {
    const b64 = await imageToBase64Downsized(a.image_url);
    if (b64) {
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: b64 },
      });
      usedIds.push(a.id);
    }
  }
  if (imageBlocks.length === 0) {
    return { profile: null, error: "all asset fetches failed" };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `${imageBlocks.length}장의 product 사진입니다. 위 schema대로 JSON 출력만.`,
            },
          ],
        },
      ],
    });
  } catch (e) {
    return {
      profile: null,
      error: `vision call failed: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { profile: null, error: `no JSON: ${text.slice(0, 100)}` };
  }
  let parsed: {
    category?: string;
    description?: string;
    visual_features?: ProductProfile["visual_features"];
    logo_placement_hints?: string[];
  };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return {
      profile: null,
      error: `JSON parse failed: ${e instanceof Error ? e.message : "?"}`,
    };
  }

  // Anthropic Sonnet 4.6 pricing approx: input $3/MTok, output $15/MTok.
  // Each image ~ 1.5K tokens. 5 images ≈ 7.5K input + ~500 output.
  const inputCost = ((resp.usage?.input_tokens ?? 0) / 1_000_000) * 3;
  const outputCost = ((resp.usage?.output_tokens ?? 0) / 1_000_000) * 15;
  const costUsd = Number((inputCost + outputCost).toFixed(4));

  const VALID_CATS: ProductCategory[] = [
    "footwear", "apparel", "cosmetics", "skincare", "fragrance",
    "accessories", "jewelry", "electronics", "home_goods",
    "food_beverage", "health_supplements", "saas_digital", "ip_media",
    "other",
  ];
  const category: ProductCategory = VALID_CATS.includes(parsed.category as ProductCategory)
    ? (parsed.category as ProductCategory)
    : "other";

  const row = {
    workspace_id: workspaceId,
    category,
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 600) : null,
    visual_features: parsed.visual_features ?? {},
    logo_placement_hints: Array.isArray(parsed.logo_placement_hints)
      ? parsed.logo_placement_hints.slice(0, 6)
      : [],
    built_from_asset_ids: usedIds,
    built_at: new Date().toISOString(),
    build_cost_usd: costUsd,
  };

  // Upsert
  const { data: saved, error } = await svc
    .from("mrai_workspace_product_profile")
    .upsert(row, { onConflict: "workspace_id" })
    .select("*")
    .single();
  if (error || !saved) {
    return { profile: null, error: error?.message ?? "save failed" };
  }
  return { profile: saved as ProductProfile };
}

export async function loadProductProfile(
  workspaceId: string,
): Promise<ProductProfile | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("mrai_workspace_product_profile")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data as ProductProfile | null) ?? null;
}
