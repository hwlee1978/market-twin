import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlatformSpec, type Platform } from "../platform-rules";
import { compositeLogoOnImage } from "./composite-logo";
import { detectLogoPlacement } from "./logo-placement";
import {
  buildProductProfile,
  loadProductProfile,
  type ProductProfile,
} from "./product-profile";
import { touchupProductImage } from "./product-touchup";
import { strictCompositeImage } from "./strict-composite";

/**
 * Image generator — Sprint 4 of Phase 9.
 *
 * Uses OpenAI gpt-image-1 (quality=medium) to generate platform-shaped
 * imagery from a draft's image_prompt. Uploads to Supabase Storage
 * bucket `mrai-content` and returns public URLs.
 *
 * Per-platform aspect ratios:
 *   - X / Facebook / LinkedIn:  1536x1024 (1.5:1 landscape)
 *   - Instagram / Threads:      1024x1024 (1:1) or 1024x1536 (2:3 portrait)
 *   - YouTube thumbnail:        1536x1024 (16:9)
 *   - TikTok / Reels:           1024x1536 (9:16 portrait)
 *   - Naver Blog/Smartstore:    1024x1024 default
 *
 * gpt-image-1 size options: 1024x1024 / 1024x1536 / 1536x1024.
 */

export type ImageGenInput = {
  prompt: string;
  platform: string;
  frameCount: number;          // 1 = cover only, 2+ = carousel
  brandHint?: string;           // brand voice fragment to enrich prompt
  variantLabel?: string;
};

export type GeneratedImage = {
  url: string;
  path: string;          // storage path (for cleanup)
  frame_index: number;
  size: string;
};

export type ImageGenResult = {
  images: GeneratedImage[];
  cost_usd: number;
  ms: number;
};

const COST_PER_IMAGE_MEDIUM = 0.042; // gpt-image-1 medium quality, all sizes

function aspectFor(platform: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const p = platform as Platform;
  if (p === "x_twitter" || p === "facebook" || p === "linkedin" || p === "youtube") {
    return "1536x1024";
  }
  if (p === "tiktok") {
    return "1024x1536";
  }
  // Instagram, threads, naver_blog, naver_smartstore, kakao_channel, reddit, other → square
  return "1024x1024";
}

// Categories that have a physical product to photograph. Workspaces in
// categories outside this set (saas_digital / ip_media / other-without-
// product) should NOT get the shoe-style "product MUST be 40% of frame"
// scaffolding — that scaffolding was authored for footwear and bleeds
// shoe vocabulary (upper, tongue, sole, FEET-FOCUSED, shoebox) into the
// gpt-image-1 prompt, which then renders sneakers even when the body
// of the prompt describes a meeting room.
const PHYSICAL_PRODUCT_CATEGORIES = new Set<string>([
  "footwear",
  "apparel",
  "cosmetics",
  "skincare",
  "fragrance",
  "accessories",
  "jewelry",
  "electronics",
  "home_goods",
  "food_beverage",
  "health_supplements",
]);

/**
 * Per-category visual scaffolding for buildFramePrompt. Each spec
 * supplies the category-shaped vocabulary the prompt builder slots in
 * for UNBRANDED-PRODUCT, FIDELITY, role lists, aesthetic, and material
 * trademark bans. Without this, the builder used to hard-code shoe
 * anatomy (upper / tongue / sole) and shoe scene roles (FEET-FOCUSED,
 * shoebox) for every workspace, which leaked sneaker geometry into
 * cosmetics / electronics / food / etc. outputs.
 *
 * The "footwear" spec stays identical to the original behavior — the
 * regression test is "does a Le Mouton frame still look like the old
 * Le Mouton frame?" If yes, the refactor is safe for that tenant.
 */
type CategoryImageSpec = {
  /** e.g. "shoe upper, side, tongue, heel, sole" — used in UNBRANDED rule */
  productParts: string;
  /** e.g. "sneaker style" — used in "do NOT generalize to a different ___" */
  styleClass: string;
  /** e.g. "felted wool? leather? mesh?" — material guess phrasing for fidelity rule */
  materialQuestions: string;
  /** e.g. "lace placement, eyelet positions, sole shape, stitching" — silhouette specifics */
  silhouetteSpecifics: string;
  /** e.g. "H1-TEX, Gore-Tex, Merino, 100% Wool, etc." — trademarks to ban from text */
  materialTrademarks: string;
  /** e.g. "editorial fashion magazine aesthetic" — magazine style hint */
  aesthetic: string;
  /** 5 detail roles for non-touchup carousel frames 1..N */
  detailRoles: string[];
  /** 5 touchup scene roles when the product is the input image (no ambassador) */
  touchupSceneRoles: string[];
};

const CATEGORY_IMAGE_SPECS: Record<string, CategoryImageSpec> = {
  footwear: {
    productParts: "shoe upper, side, tongue, heel, sole",
    styleClass: "sneaker style",
    materialQuestions: "felted wool? leather? mesh?",
    silhouetteSpecifics:
      "lace placement and count, eyelet positions, sole shape and thickness, stitching pattern",
    materialTrademarks: "H1-TEX, Gore-Tex, Merino, 100% Wool, etc.",
    aesthetic: "editorial fashion magazine aesthetic",
    detailRoles: [
      "Detail close-up — fabric/material texture of the product, NO people, NO text, fills frame with the product surface only",
      "Lifestyle shot — FEET-FOCUSED CROP ONLY. Tight composition from mid-calf down: feet wearing the shoes (≥35% of frame, dominant subject) + lower legs + pavement/floor + glimpse of environment (sidewalk, cafe floor, street curb). NO face, NO torso, NO head in frame — frame must be cropped at the knee or thigh maximum. Goal: viewer instantly recognizes the product, environment is secondary context.",
      "Different angle of the same product (3/4 view, top-down, OR sole detail). NO people, NO text. The product silhouette must clearly match the reference photos",
      "Hero pure-color background — the product centered, dramatic lighting, NO people, NO text. The product silhouette must match references exactly",
      "Product paired with a complementary object (e.g. shoebox, plant, simple chair). The product must remain the dominant subject ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input product — minimal background, hint of material/surface around the product. NO people.",
      "Lifestyle scene — the input product placed in a real outdoor environment (street, cafe sidewalk, pavement) as if someone just stepped out of frame. Visible lower legs cropped at the calf maximum are OK. NO face, NO torso, NO head visible.",
      "Different background angle — same product, fresh background composition. NO people.",
      "Hero pure-color background composition around the input product. NO people.",
      "Place the input product alongside one complementary object (shoebox, plant). NO people.",
    ],
  },
  apparel: {
    productParts: "fabric surface, seam, hem, collar, sleeve / leg opening",
    styleClass: "garment cut",
    materialQuestions: "cotton jersey? wool knit? linen? technical synthetic?",
    silhouetteSpecifics:
      "neckline shape, sleeve / leg length, fit silhouette, stitching, hem finish",
    materialTrademarks: "Gore-Tex, Lyocell, Tencel, recycled-poly, 100% Wool, etc.",
    aesthetic: "editorial fashion aesthetic",
    detailRoles: [
      "Detail close-up — fabric weave / knit texture filling the frame, NO people, NO text",
      "Lifestyle shot — TORSO OR LEG CROP ONLY. Tight composition showing the garment worn (≥40% of frame) on a body, cropped at the chin and at the knee/wrist. NO face visible. Goal: viewer recognizes the garment cut and drape.",
      "Different angle of the garment (back view, 3/4 angle, OR detail of a key construction feature). NO people, NO text",
      "Hero pure-color background — the garment on an invisible mannequin or laid flat with subtle volume, dramatic lighting. NO people, NO text",
      "Garment paired with a complementary object (e.g. hanger on a rack, folded stack on a wooden surface, beside footwear). Garment ≥40% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input garment — minimal background. NO people.",
      "Lifestyle scene — the garment worn, cropped at chin and at knee/wrist so NO face is visible. Outdoor street or indoor environment.",
      "Different background angle — same garment, fresh composition. NO people.",
      "Hero pure-color background composition. NO people.",
      "Garment paired with one complementary object (hanger, folded stack, related apparel). NO people.",
    ],
  },
  cosmetics: {
    productParts: "bottle / tube body, cap, base, label area, pump or applicator",
    styleClass: "container silhouette",
    materialQuestions: "glass? frosted plastic? metallic finish? matte cardboard?",
    silhouetteSpecifics:
      "bottle proportions, cap shape, neck collar, base footprint, label window dimensions",
    materialTrademarks: "ingredient names, % active claims, vegan / cruelty-free badges, certification logos",
    aesthetic: "beauty editorial aesthetic",
    detailRoles: [
      "Macro close-up — bottle surface texture, glass refraction, condensation droplets if relevant. NO people, NO text",
      "Lifestyle shot — HAND-AND-PRODUCT CROP. A hand holding or applying the product (≥35% of frame), cropped at the wrist and elbow. NO face. Soft natural daylight.",
      "Different angle of the bottle (3/4 view, top-down on a marble or stone surface, OR cap-off showing the applicator). NO people, NO text",
      "Hero pure-color background — the bottle centered, soft directional studio lighting. NO people, NO text",
      "Product paired with a complementary object (e.g. botanical sprig, smooth stone, marble slab, cotton pad). Bottle ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input bottle — soft surface texture. NO people.",
      "Lifestyle scene — bottle on a vanity counter or bathroom shelf with morning daylight. NO people.",
      "Different background angle — same bottle, fresh surface (marble / wood / linen). NO people.",
      "Hero pure-color background composition. NO people.",
      "Bottle paired with one botanical or natural element (sprig, stone, cotton). NO people.",
    ],
  },
  skincare: {
    productParts: "bottle / jar body, cap, base, label area, dropper or pump",
    styleClass: "container silhouette",
    materialQuestions: "amber glass? frosted glass? matte plastic? metallic pump?",
    silhouetteSpecifics:
      "bottle proportions, cap shape, dropper / pump form, base footprint, label area",
    materialTrademarks: "% active claims, dermatologist-tested badges, ingredient names like hyaluronic acid / niacinamide written as visible text",
    aesthetic: "clean skincare editorial aesthetic",
    detailRoles: [
      "Macro close-up — bottle surface or texture of the formula on a smooth surface. NO people, NO text",
      "Lifestyle shot — HAND-AND-PRODUCT CROP. A hand holding or dispensing the product (≥35% of frame), cropped at the wrist. NO face. Soft natural light.",
      "Different angle of the bottle (3/4 view, top-down, dropper-out showing the formula). NO people, NO text",
      "Hero pure-color background — bottle centered on a single-tone surface, soft daylight or gentle studio. NO people, NO text",
      "Product paired with a complementary natural element (eucalyptus / leaf / pebble / linen folded edge). Bottle ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input bottle — minimal surface texture. NO people.",
      "Lifestyle scene — bottle on a bathroom shelf or vanity with morning daylight. NO people.",
      "Different background angle — same bottle, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Bottle paired with one natural element (leaf / pebble / linen). NO people.",
    ],
  },
  fragrance: {
    productParts: "flacon body, cap, base, label area, atomizer",
    styleClass: "flacon silhouette",
    materialQuestions: "clear glass? colored glass? metallic cap? frosted accent?",
    silhouetteSpecifics:
      "flacon proportions, cap shape, neck, atomizer detail, label area",
    materialTrademarks: "concentration claims (eau de parfum / EDP percentages), perfumer-house lineage as visible text, certification badges",
    aesthetic: "luxury editorial fragrance aesthetic",
    detailRoles: [
      "Macro close-up — flacon glass refraction, light bounce on the bottle's edges. NO people, NO text",
      "Lifestyle shot — HAND-AND-FLACON CROP. A hand holding or spritzing the flacon (≥35% of frame), wrist-cropped. NO face.",
      "Different angle of the flacon (3/4, top-down, cap-off detail of atomizer). NO people, NO text",
      "Hero pure-color background — flacon centered, dramatic directional lighting that highlights glass. NO people, NO text",
      "Flacon paired with a complementary object (silk fabric, marble surface, single botanical). Flacon ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input flacon — soft texture. NO people.",
      "Lifestyle scene — flacon on a dressing-table surface with soft warm light. NO people.",
      "Different background angle — same flacon, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Flacon paired with one luxury element (silk drape / marble / single botanical). NO people.",
    ],
  },
  accessories: {
    productParts: "the object's surface, edges, and joining elements",
    styleClass: "accessory silhouette",
    materialQuestions: "leather? canvas? nylon? metal? combination?",
    silhouetteSpecifics:
      "overall shape, stitching, hardware (zipper / buckle / clasp), strap or handle form, base footprint",
    materialTrademarks: "material grade claims, brand-house letter monograms, certification badges",
    aesthetic: "editorial lifestyle aesthetic",
    detailRoles: [
      "Detail close-up — material texture, stitching, hardware up close. NO people, NO text",
      "Lifestyle shot — IN-HAND or WORN CROP. The accessory used naturally (held, slung, worn) with the human cropped above shoulder and at wrist/waist. NO face.",
      "Different angle (3/4 view, top-down, OR detail of a signature element). NO people, NO text",
      "Hero pure-color background — accessory centered, even studio lighting. NO people, NO text",
      "Accessory paired with a complementary item (related accessory, garment fragment, surface texture). Accessory ≥40% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input accessory — minimal background. NO people.",
      "Lifestyle scene — accessory used naturally (held, slung, on a surface). Crop to avoid faces.",
      "Different background angle — same accessory, fresh composition. NO people.",
      "Hero pure-color background composition. NO people.",
      "Accessory paired with one complementary item. NO people.",
    ],
  },
  jewelry: {
    productParts: "the piece's surface, setting, clasp, chain, or band",
    styleClass: "piece design",
    materialQuestions: "yellow gold? white gold? silver? platinum? rose gold?",
    silhouetteSpecifics:
      "overall form, stone setting style, chain link pattern, clasp type, finish",
    materialTrademarks: "carat claims, purity stamps (18K / 925), certification names (GIA / IGI), brand-house monograms",
    aesthetic: "luxury editorial jewelry aesthetic",
    detailRoles: [
      "Macro close-up — stone setting / metal texture / clasp detail filling the frame. NO people, NO text",
      "Lifestyle shot — WORN CROP. The piece worn on a neck / wrist / hand / ear (≥35% of frame), cropped to show only the relevant body part. NO face.",
      "Different angle of the piece (3/4, flat, stone-only macro). NO people, NO text",
      "Hero pure-color background — piece centered on a single-tone surface, jewelry lighting. NO people, NO text",
      "Piece paired with a luxury element (silk fabric, marble surface, open jewelry box edge). Piece ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the piece — soft luxury surface. NO people.",
      "Lifestyle scene — piece worn on a neck / wrist / hand / ear with strict body crop. NO face.",
      "Different background angle — same piece, fresh composition. NO people.",
      "Hero pure-color background composition. NO people.",
      "Piece paired with one luxury element (silk / marble / jewelry box edge). NO people.",
    ],
  },
  electronics: {
    productParts: "device casing, screen, ports, buttons, edges, base",
    styleClass: "device design",
    materialQuestions: "anodized aluminum? glass? matte plastic? brushed metal?",
    silhouetteSpecifics:
      "overall form, screen size and bezel, port layout, button positions, base / stand shape",
    materialTrademarks: "chip names (A17 Pro / Snapdragon), spec claims (5G / OLED / 120Hz), certification badges",
    aesthetic: "clean tech-product editorial aesthetic",
    detailRoles: [
      "Detail close-up — surface finish, port / button detail, or material edge. NO people, NO text on the device beyond a generic UI",
      "Lifestyle shot — IN-USE CROP. Hands using the device on a clean surface (≥40% of frame), wrist-cropped. NO face. Hand-and-device focus only.",
      "Different angle of the device (3/4, back, OR port edge). NO people, NO text",
      "Hero pure-color background — device centered, directional studio lighting that defines edges. NO people, NO text",
      "Device paired with a complementary desk item (notebook, coffee cup, simple plant). Device ≥40% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input device — minimal desk surface. NO people.",
      "Lifestyle scene — device on a desk or beside a workspace tool (notebook / coffee cup). NO people OR strictly hand-only crops.",
      "Different background angle — same device, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Device paired with one desk-context item. NO people.",
    ],
  },
  home_goods: {
    productParts: "the object's surface, base, handle / spout / opening",
    styleClass: "object form",
    materialQuestions: "ceramic? glass? wood? stainless steel? textile?",
    silhouetteSpecifics:
      "overall proportions, edges, handle / spout, base footprint, surface finish",
    materialTrademarks: "material grade claims, certification badges, brand monograms",
    aesthetic: "lifestyle home editorial aesthetic",
    detailRoles: [
      "Detail close-up — material texture, edge, or surface finish filling the frame. NO people, NO text",
      "Lifestyle shot — IN-ROOM CROP. The object placed in a home setting (counter / shelf / table) with a natural environmental hint. NO people OR strictly hand-only crops.",
      "Different angle of the object (3/4, top-down, OR detail of a key feature). NO people, NO text",
      "Hero pure-color background — object centered on a single-tone surface, soft directional lighting. NO people, NO text",
      "Object paired with a complementary item (related household object, plant, linen). Object ≥40% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input object — minimal background. NO people.",
      "Lifestyle scene — object in a home context (kitchen counter, living-room shelf, dining table). NO people.",
      "Different background angle — same object, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Object paired with one complementary household item. NO people.",
    ],
  },
  food_beverage: {
    productParts: "package, lid, seal, label area, opening",
    styleClass: "package design",
    materialQuestions: "cardboard? foil pouch? glass bottle? PET bottle? can?",
    silhouetteSpecifics:
      "package proportions, lid / cap shape, label panel dimensions, base / seal",
    materialTrademarks: "health claims, organic / non-GMO certifications, calorie or nutrition counts as visible numbers",
    aesthetic: "food editorial aesthetic",
    detailRoles: [
      "Detail close-up — package material texture or contents close-up if visible. NO people, NO text",
      "Lifestyle shot — TABLE-AND-PRODUCT CROP. Product served / used on a plate or surface (≥40% of frame). Hands-only acceptable, no face.",
      "Different angle of the package (3/4, top-down, OR poured-out detail showing contents). NO people, NO text",
      "Hero pure-color background — package centered on a single-tone surface, soft warm light. NO people, NO text",
      "Product paired with related ingredient / utensil / plated context (≥40% of frame). NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input package — minimal surface. NO people.",
      "Lifestyle scene — package on a kitchen counter or dining table with soft warm light. NO people.",
      "Different background angle — same package, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Package paired with one ingredient or utensil. NO people.",
    ],
  },
  health_supplements: {
    productParts: "bottle, cap, label area, base",
    styleClass: "bottle silhouette",
    materialQuestions: "amber glass? white plastic? matte metal? cardboard?",
    silhouetteSpecifics:
      "bottle proportions, cap shape, label panel, base footprint",
    materialTrademarks: "health claims, % daily value, supplement-facts panels, certification badges",
    aesthetic: "clean wellness editorial aesthetic",
    detailRoles: [
      "Detail close-up — bottle surface or capsules/powder texture if relevant. NO people, NO text",
      "Lifestyle shot — HAND-AND-PRODUCT CROP. Hand holding the bottle (≥35% of frame), wrist-cropped. NO face.",
      "Different angle of the bottle (3/4, top-down, cap-off showing the contents). NO people, NO text",
      "Hero pure-color background — bottle centered on a single-tone surface, soft daylight. NO people, NO text",
      "Bottle paired with a complementary wellness element (glass of water, small dish of capsules, natural surface). Bottle ≥35% of frame. NO people, NO text",
    ],
    touchupSceneRoles: [
      "Close-up scene around the input bottle — minimal surface. NO people.",
      "Lifestyle scene — bottle on a kitchen counter or bedside table beside a glass of water. NO people.",
      "Different background angle — same bottle, fresh surface. NO people.",
      "Hero pure-color background composition. NO people.",
      "Bottle paired with one wellness element (glass of water / dish of capsules). NO people.",
    ],
  },
};

const DEFAULT_PHYSICAL_SPEC: CategoryImageSpec = {
  productParts: "the product surface, edges, base, and any visible details",
  styleClass: "product style",
  materialQuestions: "the actual material from the reference photos",
  silhouetteSpecifics: "overall form, key features, proportions, surface finish",
  materialTrademarks: "any visible material trademarks or certification badges",
  aesthetic: "editorial product aesthetic",
  detailRoles: [
    "Detail close-up — material texture / surface of the product. NO people, NO text",
    "Lifestyle shot — IN-USE OR IN-CONTEXT CROP. Product used naturally in its intended environment (≥40% of frame). NO face — hand-only or environment-only crops.",
    "Different angle of the product (3/4 view, top-down, OR detail of a key feature). NO people, NO text",
    "Hero pure-color background — product centered, dramatic lighting. NO people, NO text",
    "Product paired with a complementary object related to its category. Product ≥40% of frame. NO people, NO text",
  ],
  touchupSceneRoles: [
    "Close-up scene around the input product — minimal background. NO people.",
    "Lifestyle scene — product in its natural use context. Hand-only or environment-only crops.",
    "Different background angle — same product, fresh composition. NO people.",
    "Hero pure-color background composition. NO people.",
    "Product paired with one complementary object. NO people.",
  ],
};

function getCategorySpec(category?: string): CategoryImageSpec {
  if (!category) return DEFAULT_PHYSICAL_SPEC;
  return CATEGORY_IMAGE_SPECS[category] ?? DEFAULT_PHYSICAL_SPEC;
}

/**
 * Extract a single frame's description from a multi-frame carousel prompt.
 *
 * The drafter LLM writes prompts like:
 *   "6-frame Instagram carousel, ... Frame 1 (hook): close-up shoe.
 *    Frame 2: woman walking. Frame 3: macro split. ..."
 *   or Korean: "6장 인스타그램 캐러셀 ... 프레임 1(후크): ... 프레임 2: ..."
 *
 * Previously buildFramePrompt sent the ENTIRE multi-frame description to
 * each per-frame gpt-image-1 call. The model then either picked frames
 * randomly or rendered a generic blend. User report: 6-frame structured
 * editorial prompt → 4 unrelated generic product shots.
 *
 * This helper returns:
 *   - { intro, frame } when a per-frame block was found — caller uses
 *     `intro + frame` instead of full basePrompt.
 *   - null when no frame structure detected — caller falls back to
 *     basePrompt as-is (preserves single-shot prompt behavior).
 */
function extractFrameDescription(
  basePrompt: string,
  frameIndex: number,
): { intro: string; frame: string } | null {
  // Match "Frame N:" / "Frame N (anything):" / "프레임 N:" / "프레임 N(anything):"
  // The number must be standalone (no neighbouring digit/letter) so we
  // don't catch incidental "frame 1080p" type matches.
  const frameRegex =
    /(?:^|\s|·|—|,)\s*(?:Frame|프레임)\s*(\d+)\s*(?:\([^)]*\))?\s*[:：]/giu;
  const matches: Array<{ n: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = frameRegex.exec(basePrompt)) !== null) {
    matches.push({
      n: parseInt(m[1], 10),
      start: m.index + m[0].length,
      end: m.index, // start of this match marker (used as end of previous block)
    });
  }
  if (matches.length < 2) return null; // Not a multi-frame structured prompt

  const target = matches.find((x) => x.n === frameIndex + 1);
  if (!target) return null;

  const idx = matches.indexOf(target);
  const blockStart = target.start;
  const blockEnd = idx + 1 < matches.length ? matches[idx + 1].end : basePrompt.length;
  const frame = basePrompt.slice(blockStart, blockEnd).trim().replace(/[.;,—–-]+$/, "");

  // Intro = everything before the first "Frame 1:" marker — the overall
  // aesthetic/mood/palette. Send to every frame so visual continuity holds.
  const intro = basePrompt.slice(0, matches[0].end).trim().replace(/[.;,—–-]+$/, "");

  if (frame.length < 10) return null; // Sanity check on extraction
  return { intro, frame };
}

function buildFramePrompt(
  basePrompt: string,
  platform: string,
  frameIndex: number,
  totalFrames: number,
  brandHint?: string,
  hasReferences = false,
  hasLogoReference = false,
  hasAmbassadorReference = false,
  productProfile?: ProductProfile | null,
  touchupMode = false,
): string {
  // Per-frame description extraction — if drafter wrote a multi-frame
  // structured prompt ("Frame 1: ... Frame 2: ..."), use only this frame's
  // block instead of the full description. Falls through to the original
  // basePrompt when no frame structure is detected.
  const extracted = extractFrameDescription(basePrompt, frameIndex);
  const effectivePrompt = extracted
    ? `${extracted.intro} || THIS FRAME ONLY: ${extracted.frame}`
    : basePrompt;
  basePrompt = effectivePrompt;
  const spec = getPlatformSpec(platform);
  const parts: string[] = [];

  // Decide whether this image even HAS a product subject. Two ways to
  // qualify as "has a product":
  //   (a) the workspace's product profile sits in a physical-product
  //       category, OR
  //   (b) the caller passed concrete reference photos (hasReferences) —
  //       even an "other" workspace might be running a product shoot.
  // If neither holds, we short-circuit to a scene-only prompt below
  // and never touch the shoe-shaped scaffolding.
  const categoryIsPhysical =
    !!productProfile?.category &&
    PHYSICAL_PRODUCT_CATEGORIES.has(productProfile.category);
  const isSceneOnly = !categoryIsPhysical && !hasReferences && !touchupMode;
  // Category-shaped scaffolding vocabulary. Falls back to a generic
  // "product" spec when the category is unknown or when references are
  // present without a profile (e.g. a workspace running a product
  // shoot before they've built the profile).
  const catSpec = getCategorySpec(productProfile?.category);

  // ─── SCENE-ONLY MODE ────────────────────────────────────────────
  // No physical product, no references — generate the scene exactly as
  // described in basePrompt without any product fidelity / dominance /
  // shoe-shaped scaffolding. Used by SaaS / digital / IP workspaces
  // whose "content" is an editorial brand image, not a product shot.
  if (isSceneOnly) {
    parts.push(
      `Editorial brand image for ${spec.label}. Generate the scene exactly as described — there is no specific physical product to feature. NO faces in close-up unless the scene naturally calls for distant or angled figures (back-of-head, silhouettes, hands-only are fine). NO invented logos or trademark text on any signage / screen / wall / packaging visible in the scene; abstract shapes or out-of-focus text suggestions are acceptable. Scene: ${basePrompt}`,
    );
    if (brandHint) {
      parts.push(`Brand voice: ${brandHint}.`);
    }
    parts.push(
      "Photographic, editorial style. Natural lighting. Clean composition with intentional negative space.",
    );
    // Same no-text rule as the product path — gpt-image-1 garbles any
    // Latin / CJK letters it tries to render, and a non-product scene
    // is just as likely to have signage / screens / books inviting that
    // failure mode.
    parts.push(
      `ABSOLUTE NO-TEXT RULE: Do not render any visible legible text — no random Latin / Korean / Chinese / Japanese letters on signage, screens, books, displays, name tags, whiteboards, presentation slides, packaging, etc. Numbers shown on a screen are OK ONLY when they're explicitly named in the scene description above (e.g. a stat like '16.3%') — otherwise omit numeric displays. Invented brand names, awards, certifications: forbidden. If text would naturally appear, render it as blurred / out-of-focus / cropped out instead.`,
    );
    parts.push(
      "No watermarks. No fake reviews or testimonials. No collages or multi-panel layouts. No invented certification badges.",
    );
    return parts.join(" ");
  }

  // ─── TOUCHUP MODE — the subject (product OR ambassador) is in the
  // input image; do not describe it (sending details makes the model
  // "improve" the masked subject with extra features).
  if (touchupMode) {
    if (hasAmbassadorReference) {
      // Ambassador touchup — preserve celebrity face + outfit + product
      parts.push(
        "INPUT IMAGE = the EXACT person being photographed in a new scene. This is a contracted brand ambassador — their face, hairstyle, body proportions, skin tone, outfit (including the brand product they're wearing) must remain IDENTICAL. Treat them like a real person — do NOT alter their face, swap features, restyle hair, change outfit colors, or 'improve' the product they're wearing. ONLY the area outside the person (background, environment, lighting context) should change to match the scene description below.",
      );
    } else {
      parts.push(
        "INPUT IMAGE = the EXACT physical product being photographed in a new scene. Treat the product like a real object placed in front of you — do NOT add color blocks, panels, mesh, perforations, stitching, or any detail that isn't already physically present. Do NOT recolor, restyle, or 'improve' the product. ONLY the area outside the product (background, surface, lighting environment) should change to match the scene description below. The product itself must be IDENTICAL to the input.",
      );
    }
  }

  // ─── PRODUCT SPEC (when profile exists, this is the authoritative
  // description for what the product is — feeds all categories, not
  // just footwear) ────────────────────────────────────────────────
  // Skipped in touchup mode (the product is the input image, not described
  // — sending product description here causes the model to "fix" the
  // image to match the text, which is the opposite of preservation).
  if (productProfile && !touchupMode) {
    const vf = productProfile.visual_features ?? {};
    const specLines: string[] = [];
    if (productProfile.description) {
      specLines.push(`Product: ${productProfile.description}`);
    }
    if (vf.silhouette) specLines.push(`Silhouette: ${vf.silhouette}`);
    if (vf.materials && vf.materials.length) {
      specLines.push(`Materials: ${vf.materials.join(", ")}`);
    }
    if (vf.colors && vf.colors.length) {
      // When the extractor includes hex codes (e.g. "cream off-white
      // (#F2EADA)"), gpt-image-1 responds to them — emphasize exactness.
      const hasHex = vf.colors.some((c) => /#[0-9a-fA-F]{3,6}/.test(c));
      specLines.push(
        hasHex
          ? `Colors (MUST match these EXACT hex codes — sample pixel-perfect from references, do NOT shift hue/saturation): ${vf.colors.join(", ")}`
          : `Colors: ${vf.colors.join(", ")}`,
      );
    }
    if (vf.distinguishing && vf.distinguishing.length) {
      specLines.push(`Distinguishing features: ${vf.distinguishing.join(", ")}`);
    }
    if (specLines.length > 0) {
      parts.push(
        `PRODUCT SPEC (must match exactly — not a different style/color/silhouette):\n${specLines.join("\n")}`,
      );
    }
    if (vf.not_features && vf.not_features.length) {
      parts.push(
        `THE PRODUCT IS NOT (do NOT generate these features — model tends to drift toward generic category defaults):\n${vf.not_features.map((f) => `- ${f}`).join("\n")}`,
      );
    }
  }

  // ─── ABSOLUTE VISUAL RULE — applies whether or not a logo exists.
  // Logo is always added via post-production composite (sharp overlay),
  // NEVER painted by the model. The model's job is to produce a
  // completely UNBRANDED product. Any letter/text the model paints on
  // the product will be wrong (garbled "Le Misdard" / "Lachiisoan" /
  // "Bredisn" type hallucinations are the universal failure mode).
  parts.push(
    `VISUAL RULE — UNBRANDED PRODUCT: The product (${catSpec.productParts}) MUST be COMPLETELY CLEAN with ZERO text or logo anywhere on its surface. Imagine a factory-fresh sample BEFORE the branding/printing step. NO printed text, NO brand marks, NO embroidered names, NO material trademarks (${catSpec.materialTrademarks}), NO certification badges, NO invented letter shapes (e.g. 'Le Misdard', 'Lachiisoan', 'Bredisn' style hallucinations). The brand logo is added separately via post-production overlay — do NOT paint it. Hallucinated brand text on the product is the #1 failure mode and will ruin the campaign.`,
  );
  if (hasLogoReference) {
    parts.push(
      "Note: a brand logo will be composited as a small corner watermark AFTER generation. You do NOT need to include the logo anywhere in this image. Focus on a clean unbranded product.",
    );
  }

  if (hasReferences) {
    parts.push(
      `PRODUCT FIDELITY (CRITICAL): The first 1-2 reference photos show the EXACT real product. The product in your output MUST match those references in: silhouette outline, material/texture (${catSpec.materialQuestions}), ${catSpec.silhouetteSpecifics}, color/colorway. DO NOT generalize to a different ${catSpec.styleClass}. DO NOT switch to a different colorway. DO NOT change the silhouette. Treat the references as a strict blueprint — the only freedom you have is scene / angle / framing / lighting / model wearing it.`,
    );
  }
  if (hasAmbassadorReference) {
    parts.push(
      "CRITICAL: One or more references contain a contracted brand AMBASSADOR (real celebrity or model under advertising contract). You MUST preserve their exact face, hairstyle, body proportions, skin tone, eye color, and any signature features — they are the most marketing-valuable asset in this content. Do NOT invent a different person, generic model, or generic Asian/Western model — render the SAME individual from the reference, in a different pose / scene / outfit / framing if the prompt asks for one, but ALWAYS the same identifiable face. If the reference shows a partial figure (e.g. just torso), you may extrapolate the rest of the body but the face must match. If you cannot maintain face fidelity, prefer to crop the face out (back-of-head, lower-body-only) rather than substitute a different person.",
    );
  }

  if (touchupMode) {
    // Scene-only direction (product is in the input image)
    if (totalFrames === 1) {
      parts.push(
        `Place the input product as the hero subject in a clean editorial scene appropriate for ${spec.label}. Scene context: ${basePrompt}`,
      );
    } else if (frameIndex === 0) {
      parts.push(
        `Cover frame for a ${spec.label} carousel. Place the input product centered on a clean uncluttered background. NO people. Scene context: ${basePrompt}`,
      );
    } else {
      // Pick scene roles based on what's in the input:
      // - Ambassador source → person is being preserved, so lifestyle
      //   role can keep face/figure visible. Just regenerate the
      //   environment around them (street/cafe/park/etc.).
      // - Product source → no person in input, so prompts mandate "NO
      //   people" so model doesn't invent one.
      // Ambassador touchup roles are category-agnostic — the human is
      // the subject. Product touchup roles come from the category spec
      // so a cosmetics bottle gets a bathroom-shelf scene, not a
      // sidewalk crop.
      const sceneRoles = hasAmbassadorReference
        ? [
            "Close-up scene context — softly blurred environment around the person/product. Keep the input subject unchanged.",
            "Lifestyle scene — preserve the input person and product exactly as shown. Only the BACKGROUND environment (street, cafe, park, indoor space, etc.) regenerates to match the scene direction.",
            "Different background environment — same input subject, fresh outdoor or indoor location.",
            "Clean studio-like background around the input subject — neutral seamless backdrop.",
            "Input subject in an environment with one complementary contextual element (window, plant, bench).",
          ]
        : catSpec.touchupSceneRoles;
      parts.push(
        `Carousel frame ${frameIndex + 1} of ${totalFrames}. ${sceneRoles[(frameIndex - 1) % sceneRoles.length]} Scene context: ${basePrompt}`,
      );
    }
  } else if (totalFrames === 1) {
    parts.push(
      `Hero brand image for ${spec.label}. The product MUST be the dominant subject, occupying at least 40% of the frame, in sharp focus, matching the reference photos exactly. ${basePrompt}`,
    );
  } else if (frameIndex === 0) {
    parts.push(
      `Cover image (frame 1 of ${totalFrames}) for a ${spec.label} carousel. The product MUST be the dominant subject (≥45% of frame), centered and in sharp focus, on a clean uncluttered background. Match the reference photos exactly (silhouette, color, material). NO people in this frame. ${basePrompt}`,
    );
  } else {
    // Role-specific prompts — each one explicitly mandates what MUST be
    // visible so we don't get the "lifestyle frame with no product
    // visible" failure mode. Roles come from the category spec so a
    // cosmetics carousel gets bottle / hand / marble compositions, not
    // shoes / feet / sidewalk.
    const role =
      catSpec.detailRoles[(frameIndex - 1) % catSpec.detailRoles.length];
    parts.push(
      `Carousel frame ${frameIndex + 1} of ${totalFrames} for ${spec.label}. ${role}. Visual continuity with cover. ${basePrompt}`,
    );
  }

  if (brandHint) {
    parts.push(`Brand voice: ${brandHint}.`);
  }
  parts.push(`Photographic, ${catSpec.aesthetic}. Natural lighting.`);

  // ─── HARD NO-TEXT RULE — gpt-image-1 is unreliable at text rendering
  // (especially Korean / CJK / numbers). Garbled fake letters like
  // "Bredisn", "Lachiisoan", random digits on scales/price tags etc.
  // ruin every campaign. So we ban ALL incidental text rendering and
  // the user's actual logo (if any) is the ONLY permitted text. Even
  // that should be omitted if the model can't reproduce the exact
  // letterforms.
  parts.push(
    `ABSOLUTE NO-TEXT RULE: Do not render ANY of the following as visible text in the image —
- Material trademarks: ${catSpec.materialTrademarks}
- Random Latin / Korean / Chinese / Japanese letter shapes anywhere (the product surface, walls, signage, scales, displays, price tags, packaging, whiteboards, books, screens, name tags).
- Numbers on devices (no scales showing "6027", no displays showing arbitrary digits, no price tags with prices).
- Invented sub-brand names, certifications, awards, ratings, taglines.
- Any letterforms on the product surface other than the brand's exact logo from the reference image.
If you cannot reproduce the exact reference logo, OMIT IT — show a clean unbranded surface or crop the product so the logo area is out of frame. Garbled letters are WORSE than no logo. Choose composition / framing / angle that avoids text-bearing surfaces entirely.`,
  );
  parts.push(
    "No watermarks. No fake reviews or testimonials. No collages or multi-panel layouts. No invented certification badges.",
  );
  return parts.join(" ");
}

async function uploadToStorage(
  buffer: Buffer,
  workspaceId: string,
  draftId: string,
  frameIndex: number,
): Promise<{ url: string; path: string }> {
  const supabase = createServiceClient();
  const path = `${workspaceId}/${draftId}/frame-${frameIndex}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from("mrai-content")
    .upload(path, buffer, {
      contentType: "image/png",
      cacheControl: "31536000", // 1 year
      upsert: false,
    });
  if (upErr) {
    throw new Error(`storage upload failed: ${upErr.message}`);
  }
  const { data: pub } = supabase.storage.from("mrai-content").getPublicUrl(path);
  return { url: pub.publicUrl, path };
}

export type BrandReference = {
  id: string;
  image_url: string;
  asset_type: string;
  label: string | null;
};

/**
 * Pick the best logo from candidates. Heuristic:
 *   1. Prefer logos with alpha channel (transparent background) —
 *      composites cleanly without a white box.
 *   2. Tiebreaker: higher resolution wins (= sharper composite).
 * Falls back to first candidate if all fetches fail.
 */
async function pickBestLogo(
  candidates: BrandReference[],
): Promise<BrandReference | undefined> {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const scored: Array<{ ref: BrandReference; score: number; pixels: number }> = [];
  // Lazy import sharp where used
  const sharp = (await import("sharp")).default;
  for (const ref of candidates) {
    try {
      const r = await fetch(ref.image_url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const meta = await sharp(buf).metadata();
      const hasAlpha = meta.hasAlpha === true;
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const pixels = w * h;
      // Score: transparency = +100, resolution adds 0-50
      const score = (hasAlpha ? 100 : 0) + Math.min(50, pixels / 100_000);
      scored.push({ ref, score, pixels });
    } catch {
      // Skip on fetch error
    }
  }
  if (scored.length === 0) return candidates[0];
  scored.sort((a, b) => b.score - a.score);
  console.log(
    `[image-gen] picked logo: score=${scored[0].score.toFixed(1)} pixels=${scored[0].pixels} (of ${scored.length} candidates)`,
  );
  return scored[0].ref;
}

/**
 * Frame roles → which reference types matter for that frame.
 *
 * The model gets confused when it has to blend a person photo with a
 * product photo. So we send role-appropriate references per frame:
 *   - cover / detail / hero / product-paired → PRODUCT ONLY (no people)
 *   - lifestyle → product + ambassador (and prompt demands both visible)
 *
 * For non-shoe categories this still works: replace "product" with
 * "main item being marketed".
 */
function pickRefsForFrame(
  allRefs: BrandReference[],
  totalFrames: number,
  frameIndex: number,
): BrandReference[] {
  const byType = (t: string) => allRefs.filter((r) => r.asset_type === t);
  const products = byType("product");
  const ambassadors = byType("ambassador");
  const lifestyle = byType("lifestyle");
  const packaging = byType("packaging");

  // Single-frame generation → product-anchored hero
  if (totalFrames === 1) {
    return [...products.slice(0, 2), ...packaging.slice(0, 1)].slice(0, 3);
  }

  // Cover → strictly product
  if (frameIndex === 0) {
    return [...products.slice(0, 3), ...packaging.slice(0, 1)].slice(0, 3);
  }

  // detailRoles index = (frameIndex - 1) % 5
  // 0=detail, 1=lifestyle, 2=different-angle, 3=hero, 4=paired
  const roleIdx = (frameIndex - 1) % 5;
  if (roleIdx === 1) {
    // Lifestyle — product + ambassador both needed
    return [
      ...products.slice(0, 1),
      ...ambassadors.slice(0, 1),
      ...lifestyle.slice(0, 1),
    ].slice(0, 3);
  }
  // All other detail roles — product only (no people, no scene clutter)
  return [...products.slice(0, 2), ...packaging.slice(0, 1)].slice(0, 3);
}

export type ImageGenSettings = {
  logo_position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  logo_size_pct: number;
  logo_padding_pct: number;
  logo_opacity: number;
  logo_with_backdrop: boolean;
  logo_composite_enabled: boolean;
  /** product_surface = Vision-detect + place on product naturally.
   *  corner_watermark = fixed bottom-right (cheap, reliable). */
  logo_placement_mode: "product_surface" | "corner_watermark";
  /** When true + product photos exist, use library photo as image-edit
   *  base + mask out product area (100% accurate product). Otherwise
   *  fall back to reference-based text-to-image (model invents). */
  use_library_photo_as_base: boolean;
  prompt_strictness: "creative" | "balanced" | "strict";
  quality: "low" | "medium" | "high";
};

const DEFAULT_SETTINGS: ImageGenSettings = {
  logo_position: "bottom-right",
  logo_size_pct: 16,
  logo_padding_pct: 3.5,
  logo_opacity: 1.0,
  logo_with_backdrop: true,
  logo_composite_enabled: true,
  logo_placement_mode: "product_surface",
  use_library_photo_as_base: true,
  prompt_strictness: "strict",
  quality: "medium",
};

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  return toFile(buf, name, { type: mime });
}

export async function generateImagesForDraft(input: {
  workspaceId: string;
  draftId: string;
  prompt: string;
  platform: string;
  frameCount: number;
  brandHint?: string;
  variantLabel?: string;
  references?: BrandReference[];   // workspace brand assets to use as visual reference
  settings?: Partial<ImageGenSettings>;
  /** When set, generate only the single frame at this index and return
   * just that one. Used by the per-frame regenerate endpoint. */
  singleFrameIndex?: number;
}): Promise<ImageGenResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const t0 = Date.now();
  const size = aspectFor(input.platform);
  const totalFrames = Math.min(Math.max(input.frameCount, 1), 7);
  const settings: ImageGenSettings = { ...DEFAULT_SETTINGS, ...input.settings };
  // Cap at 5 here so caller can include logo (filtered out below for
  // model input) without losing a non-logo slot. Effective gpt-image-1
  // input is still ≤4 after logo filter.
  // Accept all refs (caller may pass more than 4); per-frame logic
  // picks the right subset based on role.
  const allRefs = input.references ?? [];

  // When multiple logos exist, pick the BEST one — preferring those
  // with transparent backgrounds (cleaner composite, no white box).
  // Higher resolution wins as tiebreaker.
  const logoCandidates = allRefs.filter((r) => r.asset_type === "logo");
  const logoRef = await pickBestLogo(logoCandidates);

  // Load product profile (vision-extracted product card). When the
  // profile says the real product is unbranded (logo_visible_on_product
  // === false), we skip the forced logo composite even if the user
  // uploaded a logo asset — user explicit feedback: "라이브러리 제품
  // 사진에서 로고가 안보인다면 꼭 로고를 억지로 넣어야 할 필요는 없음".
  let productProfile = await loadProductProfile(input.workspaceId);
  // Auto-trigger profile build if missing AND product photos exist.
  // One-time cost (~$0.03), then cached forever — eliminates the
  // "forgot to click extract button" failure mode.
  if (!productProfile && allRefs.some((r) => r.asset_type === "product")) {
    try {
      const r = await buildProductProfile(input.workspaceId);
      if (r.profile) {
        productProfile = r.profile;
        console.log("[image-gen] auto-built product profile:", r.profile.category);
      }
    } catch (e) {
      console.warn(
        "[image-gen] auto profile build failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  const productHasVisibleLogo =
    productProfile?.visual_features?.logo_visible_on_product !== false;

  // Logo is HANDLED ENTIRELY BY POST-PRODUCTION COMPOSITE (sharp overlay).
  // We deliberately do NOT pass the logo to gpt-image-1 as a reference,
  // because doing so trains the model to paint a (garbled) version of
  // it onto the product surface ("Le Misdard" / "Lachiisoan" / etc.).
  // The composite stamps the real PNG on top after generation.
  const willComposite =
    !!logoRef && settings.logo_composite_enabled && productHasVisibleLogo;
  const hasLogo = willComposite; // for prompt-builder flag
  if (logoRef && settings.logo_composite_enabled && !productHasVisibleLogo) {
    console.log(
      "[image-gen] product profile says logo not visible on product — skipping composite",
    );
  }

  // Pre-fetch ALL non-logo references once (used across frames per role).
  const nonLogoRefs = allRefs.filter((r) => r.asset_type !== "logo");
  const fileByRefId = new Map<string, File>();
  for (let i = 0; i < nonLogoRefs.length; i++) {
    try {
      const f = await fetchAsFile(nonLogoRefs[i].image_url, `ref-${i}.png`);
      fileByRefId.set(nonLogoRefs[i].id, f);
    } catch (e) {
      console.warn(`[image-gen] skipping reference:`, e instanceof Error ? e.message : e);
    }
  }

  const images: GeneratedImage[] = [];
  const usedReferenceIds = new Set<string>();
  // Pre-fetch logo buffer once for post-production composite (avoids
  // hitting Storage CDN per-frame).
  let logoBufferForComposite: Buffer | null = null;
  if (logoRef && settings.logo_composite_enabled) {
    try {
      const r = await fetch(logoRef.image_url);
      if (r.ok) logoBufferForComposite = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.warn("[image-gen] logo prefetch failed:", e instanceof Error ? e.message : e);
    }
  }
  // Determine frame range — full generation OR single-frame regenerate
  const frameIndices: number[] =
    typeof input.singleFrameIndex === "number"
      ? [Math.max(0, Math.min(input.singleFrameIndex, totalFrames - 1))]
      : Array.from({ length: totalFrames }, (_, i) => i);

  // Sequential generation — gpt-image-1 has aggressive rate limits and
  // we want frame N to remember frame N-1's prompt thread for visual
  // continuity. Latency: ~15-25s per frame with references.
  for (const i of frameIndices) {
    // Pick role-appropriate references for this frame
    const frameRefs = pickRefsForFrame(nonLogoRefs, totalFrames, i);
    const refFiles: File[] = frameRefs
      .map((r) => fileByRefId.get(r.id))
      .filter((f): f is File => Boolean(f));
    const hasAmbassador = frameRefs.some((r) => r.asset_type === "ambassador");

    const framePrompt = buildFramePrompt(
      input.prompt,
      input.platform,
      i,
      totalFrames,
      input.brandHint,
      frameRefs.length > 0,
      hasLogo,
      hasAmbassador,
      productProfile,
    );

    // ─── TOUCHUP MODE — use library photo as base, mask the subject,
    // regenerate background only.
    //
    // For LIFESTYLE frames: prefer ambassador photo as base (user has
    // paid celebrity contracts — maximize their visibility, preserve
    // their face). Ambassador photo typically shows celebrity wearing
    // the actual product, so both are preserved.
    //
    // For ALL OTHER frames: use product photo as base (clean studio
    // composition, no person).
    const roleIdx = totalFrames > 1 && i > 0 ? (i - 1) % 5 : -1;
    const isLifestyle = roleIdx === 1;
    const productPhotos = nonLogoRefs.filter((r) => r.asset_type === "product");
    const ambassadorPhotos = nonLogoRefs.filter((r) => r.asset_type === "ambassador");
    const touchupSourceType: "product" | "ambassador" | null = isLifestyle
      ? ambassadorPhotos.length > 0
        ? "ambassador"
        : productPhotos.length > 0
          ? "product"
          : null
      : productPhotos.length > 0
        ? "product"
        : null;
    const useTouchup =
      settings.use_library_photo_as_base && touchupSourceType !== null;
    if (!useTouchup) {
      console.log(
        `[image-gen] ⚠️ frame ${i} NOT using touchup. reasons: ` +
          [
            !settings.use_library_photo_as_base ? "setting OFF" : null,
            touchupSourceType === null
              ? isLifestyle
                ? "no ambassador or product photos for lifestyle"
                : "no product photos"
              : null,
          ]
            .filter(Boolean)
            .join(", "),
      );
    }

    if (useTouchup) {
      const sourcePool =
        touchupSourceType === "ambassador" ? ambassadorPhotos : productPhotos;
      // Source pick:
      //   - Ambassador: random pick from the library (AS-IS path, no
      //     scene gen). Variety only.
      //   - Product: vision-classified + Haiku-matched to the scene
      //     prompt. Picks 3/4 + in-context shots for editorial scenes,
      //     avoids back/top-down unless the scene is explicitly a
      //     flatlay. Falls back to random on classifier failure.
      let sourceAsset:
        | { id: string; image_url: string; label: string | null; asset_type?: string }
        | undefined;
      if (touchupSourceType === "product" && sourcePool.length > 1) {
        try {
          const { pickBestProductForPrompt } = await import(
            "./product-classifier"
          );
          const picked = await pickBestProductForPrompt({
            workspaceId: input.workspaceId,
            scenePrompt: input.prompt,
            products: sourcePool.map((p) => ({
              id: p.id,
              image_url: p.image_url,
              label: p.label ?? null,
            })),
          });
          if (picked) {
            sourceAsset = sourcePool.find((p) => p.id === picked.id);
          }
        } catch (e) {
          console.warn(
            "[image-gen] product-classifier failed, falling back to random:",
            e instanceof Error ? e.message : e,
          );
        }
      }
      if (!sourceAsset) {
        // Always random pick — both for single-frame regen and for
        // full-carousel bulk generation. The previous `i % poolSize`
        // deterministic fallback meant frame 0 was ALWAYS pool[0],
        // so on single-frame platforms (X/Twitter) every bulk-
        // generated draft used the same ambassador photo. For
        // multi-frame carousels random still gives variety while
        // gradually covering the library across regens.
        const sourceIdx = Math.floor(
          Math.random() * Math.max(1, sourcePool.length),
        );
        sourceAsset = sourcePool[sourceIdx];
      }
      const sourceUrl = sourceAsset?.image_url;
      if (!sourceUrl || !sourceAsset) continue;
      const sourceLabel =
        touchupSourceType === "ambassador" ? "AMBASSADOR" : "PRODUCT";
      // Build touchup-mode prompt — skips product description (the
      // product IS the image; describing it makes the model "fix" the
      // image to match text, producing two-tone panels / mesh / etc.).
      const touchupPrompt = buildFramePrompt(
        input.prompt,
        input.platform,
        i,
        totalFrames,
        input.brandHint,
        false,
        hasLogo,
        touchupSourceType === "ambassador",
        productProfile,
        true, // touchupMode
      );

      // ─── AMBASSADOR FRAMES: source photo AS-IS. No AI scene gen.
      // (See deeper rationale in earlier comment removed for brevity.)
      //
      // ─── PRODUCT FRAMES: TWO paths, chosen by source-photo composition.
      //
      // (a) STRICT-COMPOSITE — only when the chosen source is a clean
      //     product-only studio shot (composition tag = single-product
      //     or pair-of-products). bg-removal cleanly separates the
      //     product, sharp pastes it onto an AI-generated scene with
      //     no visible seam.
      //
      // (b) LIFESTYLE-GEN — when the chosen source is product-with-
      //     model / product-in-use / product-with-context, OR the
      //     frame is not the cover (carousel lifestyle slot). Going
      //     through bg-removal here cuts a hand/leg along with the
      //     product and leaves a rectangular seam in the final image.
      //     Instead: feed the library product photos as REFERENCES to
      //     gpt-image-1.edit, which generates a fresh photorealistic
      //     image with the product faithfully rendered in a natural
      //     scene matching the prompt. Library photo is reference only,
      //     not composited.
      let strictHandled = false;

      // Product frames default to LIFESTYLE-GEN — gpt-image-1.edit
      // renders ONE coherent photo using the library product photo
      // as a reference, instead of pasting a bg-removed cutout onto
      // an AI scene. The composite path produced a visible rectangular
      // stamp ("the shoes look like they were photoshopped onto the
      // magazine"). Single-pass generation produces natural shadows
      // and a scene-product unity that no composite can match.
      //
      // STRICT-COMPOSITE remains available as an opt-in for pure
      // product-catalog shots (white-cyc display) but is no longer the
      // default for ANY product frame.
      const useLifestyleGen = touchupSourceType === "product";
      if (useLifestyleGen) {
        console.log(`[image-gen] frame ${i} path=LIFESTYLE-GEN`);
      }

      if (touchupSourceType === "product" && useLifestyleGen) {
        try {
          const { generateLifestyleWithRefs } = await import("./lifestyle-gen");
          // Picked source + 2 random other product photos as additional
          // refs. Shuffling prevents the model from always seeing the
          // same supplementary set (which biased output toward whichever
          // color dominates the first slots of sourcePool).
          const others = sourcePool.filter((p) => p.id !== sourceAsset.id);
          for (let j = others.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [others[j], others[k]] = [others[k], others[j]];
          }
          const otherRefs = others.slice(0, 2);
          const refs = [sourceAsset, ...otherRefs].map((p) => ({
            id: p.id,
            image_url: p.image_url,
          }));
          const lg = await generateLifestyleWithRefs({
            productRefs: refs,
            scenePrompt: input.prompt,
            outputSize: size,
            quality: settings.quality,
            logoBuffer: logoBufferForComposite,
            logoOpts: {
              position: settings.logo_position,
              size_pct: settings.logo_size_pct,
              padding_pct: settings.logo_padding_pct,
              opacity: settings.logo_opacity,
              with_backdrop: settings.logo_with_backdrop,
            },
          });
          usedReferenceIds.add(sourceAsset.id);
          for (const r of otherRefs) usedReferenceIds.add(r.id);
          const uploaded = await uploadToStorage(
            lg.buffer,
            input.workspaceId,
            input.draftId,
            i,
          );
          images.push({
            url: uploaded.url,
            path: uploaded.path,
            frame_index: i,
            size,
          });
          console.log(
            `[image-gen] ✅ LIFESTYLE-GEN frame ${i} refs=${refs.length}`,
          );
          strictHandled = true;
        } catch (e) {
          console.warn(
            `[image-gen] lifestyle-gen failed for frame ${i}, falling through:`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      if (!strictHandled && touchupSourceType !== "ambassador") {
        try {
          // Pass the user's RAW prompt to strict-composite, NOT the
          // touchupPrompt wrapper. buildFramePrompt() adds product-
          // preservation language ("INPUT IMAGE = the EXACT physical
          // product...") which is meant for the EDIT call but bleeds
          // into the SCENE generation here, causing gpt-image-1 to
          // draw extra hallucinated product copies on the floor.
          // The subject pixels are composited separately via
          // bg-removal — the scene only needs to describe the empty
          // environment the user typed.
          const sc = await strictCompositeImage({
            sourceImageUrl: sourceUrl,
            sourceAssetId: sourceAsset.id,
            sourceType: touchupSourceType ?? "product",
            workspaceId: input.workspaceId,
            scenePrompt: input.prompt,
            outputSize: size,
            quality: settings.quality,
            logoBuffer: logoBufferForComposite,
            logoOpts: {
              position: settings.logo_position,
              size_pct: settings.logo_size_pct,
              padding_pct: settings.logo_padding_pct,
              opacity: settings.logo_opacity,
              with_backdrop: settings.logo_with_backdrop,
            },
          });
          if (sc && sc.used_strict) {
            usedReferenceIds.add(sourceAsset.id);
            const uploaded = await uploadToStorage(
              sc.buffer,
              input.workspaceId,
              input.draftId,
              i,
            );
            images.push({
              url: uploaded.url,
              path: uploaded.path,
              frame_index: i,
              size,
            });
            console.log(
              `[image-gen] ✅ STRICT-COMPOSITE frame ${i} [${sourceLabel}] source=...${sourceUrl.slice(-40)}`,
            );
            strictHandled = true;
          } else {
            console.log(
              `[image-gen] strict-composite returned null for frame ${i} (bg-removal failed) — falling back`,
            );
          }
        } catch (e) {
          console.warn(
            `[image-gen] strict-composite threw for frame ${i}, falling back:`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      if (strictHandled) continue;

      // ─── AMBASSADOR PATH: use the source photo as-is.
      //
      // Primary path for ambassador frames (no AI scene replacement —
      // see comment above). Also a fallback for product frames if
      // strict-composite hard-fails.
      if (touchupSourceType === "ambassador") {
        try {
          const [outW, outH] = size.split("x").map(Number);
          const srcRes = await fetch(sourceUrl);
          if (!srcRes.ok) throw new Error(`source fetch ${srcRes.status}`);
          let finalBuf: Buffer = Buffer.from(await srcRes.arrayBuffer()) as Buffer;
          finalBuf = (await (await import("sharp")).default(finalBuf)
            .resize(outW, outH, {
              fit: "contain",
              position: "center",
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .png()
            .toBuffer()) as Buffer;
          if (logoBufferForComposite) {
            const { compositeLogoOnImage } = await import("./composite-logo");
            finalBuf = (await compositeLogoOnImage(
              finalBuf,
              { buffer: logoBufferForComposite },
              {
                position: settings.logo_position,
                size_pct: settings.logo_size_pct,
                padding_pct: settings.logo_padding_pct,
                opacity: settings.logo_opacity,
                with_backdrop: settings.logo_with_backdrop,
              },
            )) as Buffer;
          }
          usedReferenceIds.add(sourceAsset.id);
          const uploaded = await uploadToStorage(
            finalBuf,
            input.workspaceId,
            input.draftId,
            i,
          );
          images.push({
            url: uploaded.url,
            path: uploaded.path,
            frame_index: i,
            size,
          });
          console.log(
            `[image-gen] ⚠️  AMBASSADOR-AS-IS fallback frame ${i} (strict failed) source=...${sourceUrl.slice(-40)}`,
          );
          continue;
        } catch (e) {
          console.warn(
            `[image-gen] ambassador-as-is also failed for frame ${i}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      try {
        const tr = await touchupProductImage({
          sourceImageUrl: sourceUrl,
          sourceType: touchupSourceType ?? "product",
          scenePrompt: touchupPrompt,
          outputSize: size,
          // Force high quality in touchup mode — better detail
          // preservation per OpenAI docs. Slightly slower / costlier
          // but worth it for the fidelity that touchup is meant to give.
          quality: "high",
          logoBuffer: logoBufferForComposite,
          logoOpts: {
            position: settings.logo_position,
            size_pct: settings.logo_size_pct,
            padding_pct: settings.logo_padding_pct,
            opacity: settings.logo_opacity,
            with_backdrop: settings.logo_with_backdrop,
          },
          useMask: true,
        });
        if (tr) {
          // Track the source asset as "used"
          const sourceAsset = productPhotos.find(
            (p) => p.image_url === sourceUrl,
          );
          if (sourceAsset) usedReferenceIds.add(sourceAsset.id);
          const uploaded = await uploadToStorage(
            tr.buffer,
            input.workspaceId,
            input.draftId,
            i,
          );
          images.push({
            url: uploaded.url,
            path: uploaded.path,
            frame_index: i,
            size,
          });
          console.log(
            `[image-gen] ✅ TOUCHUP frame ${i} [${sourceLabel}] mask=${tr.mask_source} source=...${sourceUrl.slice(-40)}`,
          );
          continue;
        }
      } catch (e) {
        console.warn(
          `[image-gen] touchup failed for frame ${i}, falling back:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    let res;
    if (refFiles.length > 0) {
      // IMAGE EDIT mode — gpt-image-1 grounds the output on the reference
      // photos so the generated marketing imagery actually matches the
      // brand's real product.
      res = await openai.images.edit({
        model: "gpt-image-1",
        image: refFiles,
        prompt: framePrompt,
        size,
        quality: settings.quality,
        n: 1,
      });
      // Track which references were "used" (we sent all of them with
      // each frame — count once per generation. Logo also tracked via
      // composite path below.
      frameRefs.forEach((r) => usedReferenceIds.add(r.id));
    } else {
      // No references uploaded → fall back to text-only generate (lower
      // brand fidelity but doesn't block the user).
      res = await openai.images.generate({
        model: "gpt-image-1",
        prompt: framePrompt,
        size,
        quality: settings.quality,
        n: 1,
      });
    }
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`gpt-image-1 returned no image for frame ${i}`);
    }
    let finalBuffer: Buffer = Buffer.from(b64, "base64") as Buffer;
    // Post-production logo composite — guarantees a correct brand mark
    // appears in every frame (gpt-image-1 can't reliably render text,
    // so we let it generate a clean unbranded product and stamp the
    // real logo PNG on top).
    if (logoBufferForComposite) {
      try {
        let explicit:
          | { x: number; y: number; width: number; height?: number; rotation_deg?: number }
          | undefined;
        if (settings.logo_placement_mode === "product_surface") {
          // Run vision detection on the AI-generated frame — pass
          // workspace product-profile hints so the detector knows
          // category-appropriate placement (not just shoe-default).
          const placement = await detectLogoPlacement(finalBuffer, {
            category: productProfile?.category,
            placement_hints: productProfile?.logo_placement_hints,
            description: productProfile?.description ?? undefined,
          });
          if (placement.found && (placement.confidence ?? 0) >= 0.55) {
            explicit = {
              x: placement.x!,
              y: placement.y!,
              width: placement.width!,
              height: placement.height,
              rotation_deg: placement.rotation_deg,
            };
            console.log(
              `[image-gen] vision placed logo on frame ${i}: ${placement.location} ` +
                `(${placement.x},${placement.y}) ${placement.width}×${placement.height} ` +
                `rot=${placement.rotation_deg}° conf=${placement.confidence}`,
            );
          } else {
            console.warn(
              `[image-gen] vision detect failed/low-conf on frame ${i} — falling back to corner watermark. notes=${placement.notes}`,
            );
          }
        }
        finalBuffer = await compositeLogoOnImage(
          finalBuffer,
          { buffer: logoBufferForComposite },
          explicit
            ? {
                opacity: settings.logo_opacity,
                with_backdrop: false,
                explicit,
              }
            : {
                position: settings.logo_position,
                size_pct: settings.logo_size_pct,
                opacity: settings.logo_opacity,
                padding_pct: settings.logo_padding_pct,
                with_backdrop: settings.logo_with_backdrop,
              },
        );
      } catch (e) {
        // Composite failure should never break the whole generation —
        // fall back to the AI image as-is.
        console.warn(
          `[image-gen] logo composite failed on frame ${i}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    const uploaded = await uploadToStorage(
      finalBuffer,
      input.workspaceId,
      input.draftId,
      i,
    );
    images.push({
      url: uploaded.url,
      path: uploaded.path,
      frame_index: i,
      size,
    });
  }

  // Increment use_count on the references we actually used. Fire-and-
  // forget — not fatal if it fails.
  if (usedReferenceIds.size > 0) {
    const svc = createServiceClient();
    void svc
      .rpc("increment_brand_asset_use_count", { p_ids: Array.from(usedReferenceIds) })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          // Fallback: per-row update if the RPC isn't defined yet
          for (const aid of usedReferenceIds) {
            void svc
              .from("mrai_brand_assets")
              .update({ use_count: 1, last_used_at: new Date().toISOString() })
              .eq("id", aid);
          }
        }
      });
  }

  return {
    images,
    cost_usd: Number((images.length * COST_PER_IMAGE_MEDIUM).toFixed(4)),
    ms: Date.now() - t0,
  };
}

export function defaultFrameCountForPlatform(platform: string): number {
  const p = platform as Platform;
  // Instagram industry standard for carousel posts is 5-7 frames
  // (cover + 4-6 details). User originally requested 4 but the drafter's
  // platform spec hints at 5-7, so the prompt described "7-frame" while
  // generation only made 4 — confusing. Bumped to 6 as a middle ground.
  if (p === "instagram") return 6;
  if (p === "naver_blog") return 4;       // cover + 3 inline
  if (p === "naver_smartstore") return 5; // main + 4 detail
  if (p === "tiktok" || p === "youtube") return 1; // thumbnail only
  return 1;
}
