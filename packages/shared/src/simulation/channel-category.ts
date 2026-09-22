/**
 * Catch a named platform that belongs to the right country but the
 * wrong shelf.
 *
 * `sanitizeChannelMismatch` locks channels to countries — a Vietnamese
 * persona cannot shop on Coupang. It has no idea what a channel *sells*,
 * so a Singaporean persona reviewing a granola bar on HardwareZone
 * passes unchallenged: HardwareZone is Singaporean, and that is the only
 * question asked. It is also a PC-hardware forum, which is why the
 * sample report ended up citing it for a snack.
 *
 * This is the same class of error as citing a pet-food report for a
 * human-food market size, and it is worse than a vague answer: naming a
 * real, locally-famous site makes the claim feel checkable.
 *
 * Deliberately narrow. Only platforms whose subject is unmistakable get
 * an entry, and only a clear category conflict masks. General forums
 * (PTT, DCInside, Reddit) are never flagged — they host boards for
 * everything, so naming one says nothing false.
 */

/** Product domains a channel can legitimately serve. */
type Domain = "tech" | "beauty" | "fashion" | "food" | "health" | "baby" | "pet" | "auto";

interface ChannelEntry {
  /** Patterns that identify the platform in free text. */
  patterns: RegExp;
  /** What it actually sells or discusses. */
  serves: Domain[];
}

const CATEGORY_BOUND: ChannelEntry[] = [
  { patterns: /\bhardware\s?zone\b|하드웨어존/i, serves: ["tech"] },
  { patterns: /\bmobile\s?01\b|\bmobile01\b/i, serves: ["tech"] },
  { patterns: /\bkakaku\.?com\b|価格\.com|가카쿠/i, serves: ["tech"] },
  { patterns: /\bdanawa\b|다나와/i, serves: ["tech"] },
  { patterns: /\bquasarzone\b|퀘이사존|\bclien\b|클리앙|\bruliweb\b|루리웹/i, serves: ["tech"] },
  { patterns: /\bnewegg\b|\btom'?s hardware\b/i, serves: ["tech"] },
  { patterns: /\bsephora\b|세포라|\bulta\b/i, serves: ["beauty"] },
  { patterns: /\bglowpick\b|글로우픽|\bhwahae\b|화해/i, serves: ["beauty"] },
  { patterns: /\bzalando\b|\basos\b|\bmusinsa\b|무신사/i, serves: ["fashion"] },
  { patterns: /\bchewy\b|\bpetco\b|\bpetsmart\b/i, serves: ["pet"] },
  { patterns: /\bcarview\b|\bautotrader\b|\bbobaedream\b|보배드림/i, serves: ["auto"] },
];

/**
 * Map a project category string onto a domain. Categories are free text
 * in places, so this matches loosely and returns null when unsure —
 * unsure means no masking.
 */
function domainOf(category: string | undefined): Domain | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (/food|beverage|snack|grocer|식품|음료|간식/.test(c)) return "food";
  if (/beauty|cosmetic|skincare|뷰티|화장품/.test(c)) return "beauty";
  if (/fashion|apparel|clothing|패션|의류/.test(c)) return "fashion";
  if (/health|supplement|medical|건강|의료|영양/.test(c)) return "health";
  if (/baby|kids|infant|유아|아동/.test(c)) return "baby";
  if (/pet|반려/.test(c)) return "pet";
  if (/auto|vehicle|자동차/.test(c)) return "auto";
  if (/tech|electronic|device|gadget|saas|software|전자|가전/.test(c)) return "tech";
  return null;
}

/** Food and health overlap enough that a supplement shop suits both. */
const ADJACENT: Partial<Record<Domain, Domain[]>> = {
  food: ["health"],
  health: ["food"],
  baby: ["health"],
};

function serves(entry: ChannelEntry, domain: Domain): boolean {
  if (entry.serves.includes(domain)) return true;
  return (ADJACENT[domain] ?? []).some((d) => entry.serves.includes(d));
}

export interface ChannelCategoryResult {
  sanitized: string;
  /** Platform names removed, for logging. */
  removed: string[];
}

/**
 * Replace platforms that cannot plausibly carry this product with a
 * neutral phrase. Returns the text unchanged when the category is
 * unrecognised — a wrong mask is worse than a missed one.
 */
export function sanitizeOffCategoryChannels(
  text: string | undefined,
  category: string | undefined,
  locale: "ko" | "en",
): ChannelCategoryResult {
  if (!text) return { sanitized: "", removed: [] };
  const domain = domainOf(category);
  if (!domain) return { sanitized: text, removed: [] };

  const mask = locale === "ko" ? "현지 온라인 커뮤니티" : "a local online community";
  const removed: string[] = [];
  let out = text;
  for (const entry of CATEGORY_BOUND) {
    if (serves(entry, domain)) continue;
    out = out.replace(new RegExp(entry.patterns.source, "gi"), (m) => {
      removed.push(m);
      return mask;
    });
  }
  return { sanitized: out, removed };
}
