import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Product photo classification + scene-aware source picking.
 *
 * Replaces the previous random source pick with a two-step flow:
 *
 *   1. classifyProductAsset() — one-time Sonnet vision call per asset
 *      that extracts tags (angle, mood, composition, marketing_score)
 *      and caches the JSON in Storage at `asset-meta/{id}.json`.
 *      Cached forever; re-runs cost nothing.
 *
 *   2. pickBestProductForPrompt() — given a sanitized scene prompt
 *      and the candidate product pool, Haiku reads the cached metas
 *      and returns the best-matching asset id. Falls back to the
 *      first asset on failure.
 *
 * Goal: stop picking flat back-view shoe shots for hero/editorial
 * urban-street scenes. Match angle + mood to the prompt context.
 */

export type ProductMeta = {
  angle: "front" | "three-quarter" | "side" | "back" | "top-down" | "in-use" | "other";
  mood:
    | "studio-minimal"
    | "urban-lifestyle"
    | "outdoor-nature"
    | "indoor-cozy"
    | "editorial-dramatic"
    | "other";
  composition: "single-product" | "pair-of-products" | "with-model" | "with-context" | "other";
  marketing_score: number; // 0-100, generic appeal as a hero/cover shot
  description: string; // short one-line summary
};

async function downloadAssetMeta(
  workspaceId: string,
  assetId: string,
): Promise<ProductMeta | null> {
  const svc = createServiceClient();
  const path = `${workspaceId}/asset-meta/${assetId}.json`;
  const { data } = await svc.storage.from("mrai-content").download(path);
  if (!data) return null;
  try {
    const text = await data.text();
    return JSON.parse(text) as ProductMeta;
  } catch {
    return null;
  }
}

async function uploadAssetMeta(
  workspaceId: string,
  assetId: string,
  meta: ProductMeta,
): Promise<void> {
  const svc = createServiceClient();
  const path = `${workspaceId}/asset-meta/${assetId}.json`;
  await svc.storage
    .from("mrai-content")
    .upload(path, JSON.stringify(meta), {
      contentType: "application/json",
      cacheControl: "31536000",
      upsert: true,
    });
}

/**
 * Vision-classify a product photo. Cached per asset.
 */
export async function classifyProductAsset(
  workspaceId: string,
  assetId: string,
  imageUrl: string,
): Promise<ProductMeta | null> {
  const cached = await downloadAssetMeta(workspaceId, assetId);
  if (cached) return cached;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const srcRes = await fetch(imageUrl);
    if (!srcRes.ok) return null;
    const srcBuf = Buffer.from(await srcRes.arrayBuffer());
    const downsized = await sharp(srcBuf)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system:
        "You analyze a product photograph for marketing-image planning. " +
        "Return JSON ONLY (no preamble, no markdown) with these fields:\n" +
        '{\n' +
        '  "angle": "front" | "three-quarter" | "side" | "back" | "top-down" | "in-use" | "other",\n' +
        '  "mood": "studio-minimal" | "urban-lifestyle" | "outdoor-nature" | "indoor-cozy" | "editorial-dramatic" | "other",\n' +
        '  "composition": "single-product" | "pair-of-products" | "with-model" | "with-context" | "other",\n' +
        '  "marketing_score": 0-100,  // generic appeal as a hero/cover image. 3/4 in-context > 3/4 studio > front > side > top > back\n' +
        '  "description": "short one-line factual summary, max 80 chars"\n' +
        "}\n" +
        "Be strict — back/top angles rarely work as hero shots, score them <40.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: downsized.toString("base64"),
              },
            },
            { type: "text", text: "JSON only." },
          ],
        },
      ],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const meta = JSON.parse(m[0]) as ProductMeta;
    // Light validation
    if (typeof meta.marketing_score !== "number") return null;
    await uploadAssetMeta(workspaceId, assetId, meta);
    return meta;
  } catch (e) {
    console.warn(
      `[product-classifier] classify failed for ${assetId}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/**
 * Classify all assets in parallel (cache-aware, no-op for already-cached).
 */
export async function ensureClassified(
  workspaceId: string,
  assets: Array<{ id: string; image_url: string }>,
): Promise<Map<string, ProductMeta>> {
  const results = await Promise.allSettled(
    assets.map(async (a) => {
      const m = await classifyProductAsset(workspaceId, a.id, a.image_url);
      return { id: a.id, meta: m };
    }),
  );
  const map = new Map<string, ProductMeta>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.meta) {
      map.set(r.value.id, r.value.meta);
    }
  }
  return map;
}

/**
 * Pick the product asset whose tags best match the scene prompt.
 * Haiku reads metas + prompt and returns the index of the best fit.
 * Falls back to the highest marketing_score asset on any failure.
 */
export async function pickBestProductForPrompt(input: {
  workspaceId: string;
  scenePrompt: string;
  products: Array<{ id: string; image_url: string; label: string | null }>;
}): Promise<{ id: string; image_url: string; label: string | null } | null> {
  if (input.products.length === 0) return null;
  if (input.products.length === 1) return input.products[0];

  const metaMap = await ensureClassified(input.workspaceId, input.products);

  // If nothing classified (e.g. ANTHROPIC_API_KEY missing), fall back
  // to first product. Don't block the pipeline.
  if (metaMap.size === 0) {
    console.warn("[product-classifier] no metas — using first product");
    return input.products[0];
  }

  // Sort products: classified ones by marketing_score desc, unclassified last.
  const ranked = [...input.products].sort((a, b) => {
    const sa = metaMap.get(a.id)?.marketing_score ?? -1;
    const sb = metaMap.get(b.id)?.marketing_score ?? -1;
    return sb - sa;
  });

  // Narrow to top 8 (Haiku token budget) — these are the candidates the
  // LLM picks between.
  const candidates = ranked.slice(0, 8);

  // Eligible shortlist after Haiku pick — we then RANDOM-pick among the
  // top scene-fit candidates so consecutive regens don't always return
  // the same product (user complaint: 7 regens, 5 were the same green
  // sneaker). Variety > strict best-pick when colors/styles available.
  let shortlist: typeof candidates = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    shortlist = candidates.slice(0, 5);
  } else {
    // Build a compact catalog string for Haiku
    const catalog = candidates
      .map((p, i) => {
        const m = metaMap.get(p.id);
        if (!m) return `${i}. (unclassified) ${p.label ?? ""}`.slice(0, 120);
        return `${i}. angle=${m.angle} mood=${m.mood} comp=${m.composition} score=${m.marketing_score} | ${m.description}`;
      })
      .join("\n");

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system:
          "Pick the TOP 3-5 product photos whose ANGLE + MOOD + " +
          "COMPOSITION fit a marketing scene description. Return ONLY " +
          "the integer indices separated by commas, e.g. '2,4,1'. No " +
          "explanation.\n\n" +
          "Heuristics:\n" +
          "- Urban / cinematic / editorial → three-quarter angle, " +
          "  in-use composition, or editorial-dramatic mood.\n" +
          "- Calm studio / minimal → studio-minimal, single-product, " +
          "  front/three-quarter angle.\n" +
          "- Outdoor / lifestyle → in-use or with-context.\n" +
          "- AVOID back / top-down unless scene is a flatlay.\n\n" +
          "Candidates:\n" +
          catalog,
        messages: [
          { role: "user", content: `Scene: ${input.scenePrompt.slice(0, 600)}` },
        ],
      });
      const text = resp.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();
      const idxs = Array.from(text.matchAll(/\d+/g))
        .map((m) => parseInt(m[0], 10))
        .filter((n) => !isNaN(n) && n >= 0 && n < candidates.length);
      if (idxs.length > 0) {
        // Dedupe while preserving order
        const seen = new Set<number>();
        const ordered: number[] = [];
        for (const i of idxs) {
          if (!seen.has(i)) {
            seen.add(i);
            ordered.push(i);
          }
        }
        shortlist = ordered.slice(0, 5).map((i) => candidates[i]);
      }
    } catch (e) {
      console.warn(
        "[product-classifier] Haiku shortlist failed:",
        e instanceof Error ? e.message : e,
      );
    }
    if (shortlist.length === 0) {
      shortlist = candidates.slice(0, 5);
    }
  }

  // Random pick within the shortlist for color/style variety across
  // consecutive regens.
  const winner = shortlist[Math.floor(Math.random() * shortlist.length)];
  const meta = metaMap.get(winner.id);
  console.log(
    `[product-classifier] picked ${winner.id.slice(0, 8)} from shortlist of ${shortlist.length} (angle=${meta?.angle}, mood=${meta?.mood}, score=${meta?.marketing_score}) for scene: "${input.scenePrompt.slice(0, 80)}…"`,
  );
  return winner;
}
