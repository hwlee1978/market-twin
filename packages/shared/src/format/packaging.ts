/**
 * Product packaging spec — net content, pack count, retail format.
 *
 * Why this exists: until now the simulator only knew `basePriceCents`, so a
 * 30ml and a 100ml bottle at the same price looked identical to every
 * persona. Value-for-money judgements (the #1 driver of the price objection
 * category) and competitor comparisons are only meaningful on a UNIT basis —
 * per 100ml, per sheet, per serving.
 *
 * Convention (must match the wizard copy): `basePriceCents` is the price of
 * ONE RETAIL PACK — the thing a shopper actually puts in the cart. So a
 * 5-sheet mask box priced at 12,000 KRW is basePriceCents=1_200_000,
 * unitsPerPack=5, netContent=25, netContentUnit="ml" (per sheet).
 */

import { formatPrice } from "./price";

export const PACKAGING_UNITS = [
  "ml",
  "L",
  "g",
  "kg",
  "fl_oz",
  "oz",
  "lb",
  "piece",
  "sheet",
  "serving",
] as const;

export type PackagingUnit = (typeof PACKAGING_UNITS)[number];

export interface ProductPackaging {
  /** Net content of a SINGLE unit (e.g. 100 for a 100ml bottle, 25 for one 25ml sheet). */
  netContent?: number;
  netContentUnit?: PackagingUnit;
  /** How many units in one retail pack. 1 for a single bottle, 5 for a 5-sheet box. */
  unitsPerPack?: number;
  /** Retail format, free text: "유리 스프레이 보틀", "파우치 5매 박스", "6-can sleeve". */
  packFormat?: string;
  /** Wholesale case quantity (packs per shipping case) — B2B / distributor framing. */
  caseQty?: number;
}

/** Display label per unit code. `piece`/`sheet`/`serving` render as words. */
const UNIT_LABEL: Record<PackagingUnit, string> = {
  ml: "ml",
  L: "L",
  g: "g",
  kg: "kg",
  fl_oz: "fl oz",
  oz: "oz",
  lb: "lb",
  piece: "piece",
  sheet: "sheet",
  serving: "serving",
};

const UNIT_LABEL_KO: Record<PackagingUnit, string> = {
  ml: "ml",
  L: "L",
  g: "g",
  kg: "kg",
  fl_oz: "fl oz",
  oz: "oz",
  lb: "lb",
  piece: "개",
  sheet: "매",
  serving: "회분",
};

/** Countable units are written as "5 sheets", not "5 × 25 sheet". */
const COUNTABLE: ReadonlySet<PackagingUnit> = new Set(["piece", "sheet", "serving"]);

/**
 * Normalisation basis for the per-unit price. Volume/weight get a per-100
 * (or per-1000 for L/kg-scale) comparison; countable units compare per 1.
 */
function priceBasis(unit: PackagingUnit): { factor: number; label: string; labelKo: string } {
  switch (unit) {
    case "ml":
    case "g":
      return { factor: 100, label: `100${unit}`, labelKo: `100${unit}` };
    case "L":
    case "kg":
      return { factor: 1, label: `1${unit}`, labelKo: `1${unit}` };
    default:
      return { factor: 1, label: UNIT_LABEL[unit], labelKo: UNIT_LABEL_KO[unit] };
  }
}

function hasSpec(p: ProductPackaging | undefined | null): p is ProductPackaging {
  if (!p) return false;
  return Boolean(
    (p.netContent && p.netContentUnit) ||
      (p.unitsPerPack && p.unitsPerPack > 1) ||
      p.packFormat ||
      p.caseQty,
  );
}

function trimNum(n: number): string {
  // 100 → "100", 12.5 → "12.5", 0.333333 → "0.33"
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/**
 * Human-readable pack spec, e.g.
 *   "25ml × 5 sheets per pack (125ml total) — 파우치 박스"
 *   "100ml, single bottle"
 * Returns null when the user gave nothing to render.
 */
export function formatPackSpec(
  packaging: ProductPackaging | undefined | null,
  locale: "ko" | "en" = "en",
): string | null {
  if (!hasSpec(packaging)) return null;
  const ko = locale === "ko";
  const { netContent, netContentUnit, unitsPerPack, packFormat, caseQty } = packaging;
  const count = unitsPerPack && unitsPerPack > 0 ? unitsPerPack : 1;
  const parts: string[] = [];

  if (netContent && netContentUnit) {
    const unitLabel = ko ? UNIT_LABEL_KO[netContentUnit] : UNIT_LABEL[netContentUnit];
    const per = COUNTABLE.has(netContentUnit)
      ? `${trimNum(netContent)}${ko ? unitLabel : ` ${unitLabel}`}`
      : `${trimNum(netContent)}${unitLabel}`;
    if (count > 1) {
      const total = `${trimNum(netContent * count)}${
        COUNTABLE.has(netContentUnit) ? (ko ? unitLabel : ` ${unitLabel}`) : ko ? unitLabel : unitLabel
      }`;
      parts.push(
        ko
          ? `${per} × ${count}${UNIT_LABEL_KO.piece} (팩당 총 ${total})`
          : `${per} × ${count} per pack (${total} total)`,
      );
    } else {
      parts.push(ko ? `${per} 단품` : `${per}, single unit`);
    }
  } else if (count > 1) {
    parts.push(ko ? `팩당 ${count}${UNIT_LABEL_KO.piece}` : `${count} units per pack`);
  }

  if (packFormat) parts.push(packFormat);
  if (caseQty) {
    parts.push(ko ? `유통 박스 ${caseQty}팩 입수` : `${caseQty} packs per shipping case`);
  }
  return parts.length ? parts.join(" — ") : null;
}

/**
 * Per-unit price line, e.g. "2,400 KRW per sheet · 9,600 KRW per 100ml".
 * Returns null when the spec can't support a per-unit division.
 */
export function formatUnitPrice(
  packaging: ProductPackaging | undefined | null,
  basePriceCents: number,
  currency: string,
  locale: "ko" | "en" = "en",
): string | null {
  if (!hasSpec(packaging) || !basePriceCents || basePriceCents <= 0) return null;
  const ko = locale === "ko";
  const { netContent, netContentUnit, unitsPerPack } = packaging;
  const count = unitsPerPack && unitsPerPack > 0 ? unitsPerPack : 1;
  const parts: string[] = [];

  if (count > 1) {
    const unitWord = netContentUnit && COUNTABLE.has(netContentUnit)
      ? ko ? UNIT_LABEL_KO[netContentUnit] : UNIT_LABEL[netContentUnit]
      : ko ? "개" : "unit";
    parts.push(
      ko
        ? `${unitWord}당 ${formatPrice(basePriceCents / count, currency)}`
        : `${formatPrice(basePriceCents / count, currency)} per ${unitWord}`,
    );
  }

  if (netContent && netContentUnit && !COUNTABLE.has(netContentUnit)) {
    const total = netContent * count;
    if (total > 0) {
      const basis = priceBasis(netContentUnit);
      const per = (basePriceCents / total) * basis.factor;
      parts.push(
        ko
          ? `${basis.labelKo}당 ${formatPrice(per, currency)}`
          : `${formatPrice(per, currency)} per ${basis.label}`,
      );
    }
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * Read a `projects.packaging` jsonb blob back into a typed spec. Anything the
 * DB (or an old API caller) can't be trusted to hold — string numbers, unknown
 * unit codes, empty objects — is dropped rather than thrown, so a malformed
 * row degrades to "no spec" instead of failing the whole simulation.
 */
export function parsePackaging(raw: unknown): ProductPackaging | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const unit = PACKAGING_UNITS.find((u) => u === r.netContentUnit);
  const packFormat =
    typeof r.packFormat === "string" && r.packFormat.trim()
      ? r.packFormat.trim().slice(0, 60)
      : undefined;
  const out: ProductPackaging = {
    ...(num(r.netContent) !== undefined ? { netContent: num(r.netContent) } : {}),
    ...(unit ? { netContentUnit: unit } : {}),
    ...(num(r.unitsPerPack) !== undefined
      ? { unitsPerPack: Math.round(num(r.unitsPerPack)!) }
      : {}),
    ...(packFormat ? { packFormat } : {}),
    ...(num(r.caseQty) !== undefined ? { caseQty: Math.round(num(r.caseQty)!) } : {}),
  };
  // netContent without a unit is meaningless — drop the orphan.
  if (out.netContent !== undefined && !out.netContentUnit) delete out.netContent;
  return Object.keys(out).length ? out : undefined;
}
