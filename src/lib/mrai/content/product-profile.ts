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

const SYSTEM = `당신은 브랜드의 제품 사진을 분석해 다운스트림 콘텐츠 도구(카피라이팅·이미지 생성·로고 배치)가 정확히 어떤 제품인지 알 수 있도록 구조화된 제품 카드를 만듭니다.

같은 제품(또는 제품 라인)의 사진 1-5장이 주어집니다. 추출 항목:

1. CATEGORY — 아래 통제 목록에서 하나 선택 (값은 영문 enum 그대로):
   footwear · apparel · cosmetics · skincare · fragrance · accessories · jewelry · electronics · home_goods · food_beverage · health_supplements · saas_digital · ip_media · other

2. DESCRIPTION — 50-200자 한국어 제품 스펙 (예: "메리노 울 어퍼와 메시 패널이 결합된 로우탑 레이스업 스니커즈. 두꺼운 청키 러버 컵솔, 측면에 작은 사각형 우븐 라벨, 라이트 그레이·블랙·네이비 컬러웨이").

3. VISUAL_FEATURES — 구조화된 시각 시그니처 (모든 STRING 값은 한국어로):
   - silhouette: 전체 형태/실루엣을 1문장 한국어 (예: "약간 청키한 라운디드 컵솔이 있는 로우컷 코트 스타일 스니커즈")
   - materials: 1-4개 소재 이름 한국어 (예: "스웨이드", "메시", "러버", "메리노 울")
   - colors: 1-4개 대표 색상을 반드시 HEX 코드와 함께. 사진의 실제 픽셀에서 hex를 추출하고, 일반 팔레트명을 쓰지 마세요. 포맷 필수 — "한국어이름 (#XXXXXX)". 예: "라이트 그레이 (#C8C3BA)", "오프화이트 크림 (#EDE9E8)", "딥 네이비 (#1C2340)". 같은 계열 다른 톤은 따로 나열. hex는 image-gen 정확도의 핵심.
   - distinguishing: 1-3개 차별점 한국어 (예: "측면 패널의 작은 사각형 우븐 라벨", "두꺼운 컨트라스트 컵솔")
   - typical_angles: 1-3개 마케팅에 좋은 앵글 한국어 (예: "3/4 사이드", "탑다운 오버헤드", "측면 프로파일")
   - not_features: 3-5개 같은 카테고리에서 흔하지만 이 제품엔 없는 특징 한국어 — 이미지 생성의 negative guidance. 신발 예: ["레이스 없음 (슬립온/벨크로)", "통기성 퍼포레이션 없음", "더비·옥스포드 아님", "가죽 어퍼 아님"]. 의류 예: ["단추 없음", "오버사이즈 아님", "칼라 없음"]. 구체적으로.

4. LOGO_VISIBLE_ON_PRODUCT — boolean. true는 reference 사진 중 적어도 한 장에서 제품 표면에 브랜드 로고가 명확히 보일 때만. 모든 사진에서 로고가 없거나 가려져 있거나 불분명하면 false. 이 값이 다운스트림 이미지 생성에서 로고를 강제 합성할지 결정 (실제 제품이 무지일 때 가짜 로고가 들어가지 않도록).

5. LOGO_PLACEMENT_HINTS — 2-4개 한국어 구문. 카테고리에 어울리는 로고 자연 위치 (reference에서 보일 때만):
   - 신발: ["슈탕", "측면 패널", "힐 패치"]
   - 의류: ["좌측 가슴", "소매 커프", "헴 태그"]
   - 화장품/스킨케어: ["전면 라벨", "캡", "바닥"]
   - 전자기기: ["바디 패널", "백 플레이트", "스크린 베젤"]
   - 식음료: ["전면 라벨", "캡", "측면 패널"]
   LOGO_VISIBLE_ON_PRODUCT가 false면 빈 배열.

JSON의 KEY는 반드시 영문 그대로(category·description·visual_features·silhouette·materials·colors·distinguishing·not_features·typical_angles·logo_visible_on_product·logo_placement_hints). VALUE만 한국어. category 값은 영문 enum 그대로.

이 문자열은 다른 LLM·UI에 그대로 전달되니 구체적이고 간결하게.

JSON만 출력, prose 금지:
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
