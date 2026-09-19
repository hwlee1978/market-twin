/**
 * Design tokens for the ensemble results page.
 *
 * The Summary tab (`results/summary/*`) established the visual language:
 * gradient stat tiles, a dark hero, white section cards, soft chips. Every
 * other tab predates it and carries its own spacing, type sizes and badge
 * colours. This file is the single source those tabs migrate onto, so the
 * values live in one place instead of being re-typed per tab.
 *
 * Nothing here is computed from data — these are presentation constants
 * only. Calculation helpers stay where they are; the PDF renderer shares
 * them and must keep producing identical numbers.
 */

/** Tile gradients, in fixed order. Shared with the dashboard's KpiTiles. */
export const GRADIENTS = [
  "linear-gradient(140deg,#4f46e5,#6d5cf0)",
  "linear-gradient(140deg,#0891b2,#06b6d4)",
  "linear-gradient(140deg,#0d9c72,#10b981)",
  "linear-gradient(140deg,#d97706,#f59e0b)",
] as const;

/**
 * Decorative wave paths for stat tiles. No trend is implied — a single
 * report has no historical series to plot.
 */
export const SPARK_PATHS = [
  "M0 26 40 22 80 24 120 14 160 16 200 6",
  "M0 24 40 26 80 18 120 20 160 12 200 10",
  "M0 28 40 24 80 20 120 18 160 12 200 8",
  "M0 22 40 20 80 22 120 14 160 16 200 9",
] as const;

export type Tone = "brand" | "success" | "warn" | "risk" | "neutral";

/**
 * One tone, every surface it can appear on.
 *
 * `onDark` exists because the hero card is the only dark surface on the
 * page: the soft backgrounds below are invisible against it, and its own
 * translucent whites are invisible on a white card. Picking the wrong pair
 * is the most likely way to make an unreadable chip, so they are named
 * rather than left to judgement.
 */
export interface ToneStyle {
  /** Filled badge — white text on a saturated ground. */
  solid: string;
  /** Tinted badge on a white card. Pair with `fg`. */
  soft: string;
  /** Foreground for `soft`, and for text that carries the tone alone. */
  fg: string;
  /** Hairline for callouts and tone boxes. */
  border: string;
  /** Horizontal fill for share bars and tracks. */
  bar: string;
  /** Square icon chip behind a lucide glyph. */
  icon: string;
  /** Chip background/foreground for the dark hero surface. */
  onDark: { bg: string; fg: string };
}

export const TONE: Record<Tone, ToneStyle> = {
  brand: {
    solid: "#0b2a5b",
    soft: "rgba(11,42,91,.08)",
    fg: "#0b2a5b",
    border: "rgba(11,42,91,.18)",
    bar: "linear-gradient(90deg,#1e3a8a,#3b5bdb)",
    icon: "linear-gradient(150deg,#4f46e5,#6d5cf0)",
    onDark: { bg: "rgba(255,255,255,.14)", fg: "#c7d7ff" },
  },
  success: {
    solid: "#10b981",
    soft: "var(--color-success-soft)",
    fg: "var(--color-success)",
    border: "rgba(16,185,129,.28)",
    bar: "linear-gradient(90deg,#0d9c72,#10b981)",
    icon: "linear-gradient(150deg,#0d9c72,#10b981)",
    onDark: { bg: "rgba(110,240,193,.16)", fg: "#6ef0c1" },
  },
  warn: {
    solid: "#f59e0b",
    soft: "var(--color-warn-soft)",
    fg: "var(--color-warn)",
    border: "rgba(245,158,11,.30)",
    bar: "linear-gradient(90deg,#d97706,#f59e0b)",
    icon: "linear-gradient(150deg,#d97706,#f59e0b)",
    onDark: { bg: "rgba(251,191,36,.18)", fg: "#fcd34d" },
  },
  risk: {
    solid: "#e11d48",
    soft: "rgba(244,63,94,.14)",
    fg: "#e11d48",
    border: "rgba(244,63,94,.30)",
    bar: "linear-gradient(90deg,#e11d48,#fb7185)",
    icon: "linear-gradient(150deg,#e11d48,#fb7185)",
    onDark: { bg: "rgba(251,113,133,.18)", fg: "#fda4af" },
  },
  neutral: {
    solid: "#64748b",
    soft: "#f1f5f9",
    fg: "#475569",
    border: "#e2e8f0",
    bar: "linear-gradient(90deg,#94a3b8,#cbd5e1)",
    icon: "linear-gradient(150deg,#64748b,#94a3b8)",
    onDark: { bg: "rgba(255,255,255,.08)", fg: "rgba(255,255,255,.72)" },
  },
};

/**
 * The type scale the Summary tab settled on, named.
 *
 * These were bracket values scattered through the file — `text-[15px]
 * font-extrabold tracking-tight` and friends. Naming them is what stops the
 * nine remaining tabs from each landing on their own near-miss.
 */
export const TYPO = {
  /** Section card heading. */
  cardTitle: "text-[15px] font-extrabold text-slate-900 tracking-tight",
  /** Explanatory line under a heading. */
  cardBody: "text-[12.5px] leading-relaxed text-slate-500",
  /** Body copy that carries meaning, not just context. */
  cardCopy: "text-[13px] leading-relaxed text-slate-600",
  /** All-caps label above a number. */
  microLabel: "text-[10.5px] font-bold uppercase tracking-wider text-slate-400",
  /** Right-aligned note in a card header. */
  note: "text-[11.5px] font-semibold text-slate-400",
  /** Figure inside a MiniStat. */
  statValue: "text-[17px] font-extrabold tabular-nums text-slate-800",
  /** Table cell. */
  cell: "text-[12.5px] text-slate-700",
  /** Table column header. */
  colHead: "text-[10.5px] font-bold uppercase tracking-wider text-slate-400",
} as const;

/** Card padding, matching the Summary tab. Carries the responsive step. */
export const CARD_PAD = "p-5 sm:p-6";

/**
 * Concrete hex values for Recharts.
 *
 * TONE holds `var(--color-…)` in places, which recharts cannot resolve —
 * it writes colours as SVG attributes, not style properties, and a CSS
 * variable there resolves to nothing. So the chart palette is spelled out
 * literally and kept in step with TONE by hand.
 */
export const CHART = {
  brand: "#0b2a5b",
  brandLight: "#3b5bd9",
  accent: "#2563eb",
  violet: "#7c5cff",
  teal: "#0ea5a4",
  success: "#10b981",
  warn: "#f59e0b",
  risk: "#e11d48",
  /** Axis ticks and de-emphasised series. */
  muted: "#94a3b8",
  /** Gridlines. */
  divider: "#e8edf5",
} as const;

/**
 * Tooltip chrome shared by every chart — the same white, radius and soft
 * shadow as a SectionCard, so a hovered tooltip reads as part of the page
 * rather than a recharts default.
 */
export const CHART_TOOLTIP = {
  fontSize: 12.5,
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.10)",
  padding: "8px 12px",
} as const;

/** Axis tick styling — matches the micro-label scale. */
export const CHART_TICK = { fontSize: 10.5, fill: CHART.muted } as const;
