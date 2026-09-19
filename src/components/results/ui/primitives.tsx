/**
 * Shared presentation primitives for the ensemble results tabs.
 *
 * Extracted from the Summary tab so the other nine tabs can adopt its
 * language without each re-deriving padding, type sizes and badge colours.
 * Every component here is presentation only — no data shaping, no
 * calculation. Tabs keep calling the same helpers they always did.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { CARD_PAD, GRADIENTS, SPARK_PATHS, TONE, TYPO, type Tone } from "./tokens";

/* ────────────────────────────────────────────────────────────────
   SectionCard — the white rounded block everything else sits in.
   ──────────────────────────────────────────────────────────────── */

/**
 * Standard card shell: heading row, optional right-aligned note, optional
 * explanatory line, then content.
 *
 * Replaces the bare `className="card p-4"` blocks with a plain `<h2>`
 * inside. Pass `icon` to get the gradient chip the dashboard uses; leave it
 * off for a plain heading.
 */
export function SectionCard({
  title,
  note,
  description,
  icon: Icon,
  tone = "brand",
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Rendered in the header row, after the note. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const hasHeader = Boolean(title || note || actions);
  return (
    <section className={clsx("card", CARD_PAD, className)}>
      {hasHeader && (
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span
                className="w-6 h-6 rounded-[7px] flex items-center justify-center text-white shrink-0 self-center"
                style={{ background: TONE[tone].icon }}
              >
                <Icon size={14} strokeWidth={2.4} />
              </span>
            )}
            {title && <h3 className={TYPO.cardTitle}>{title}</h3>}
          </div>
          {(note || actions) && (
            <div className="flex items-center gap-2.5 shrink-0">
              {note && <span className={TYPO.note}>{note}</span>}
              {actions}
            </div>
          )}
        </div>
      )}
      {description && <p className={clsx("mt-1.5", TYPO.cardBody)}>{description}</p>}
      <div className={hasHeader || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
   Chip — one badge component for every badge on the page.
   ──────────────────────────────────────────────────────────────── */

/**
 * Tone badge in three variants.
 *
 * `soft` on white cards, `solid` when the badge itself must carry weight
 * (a HIGH risk row), `onDark` on the hero. The variants are separate
 * because a soft chip disappears on the hero and the hero's translucent
 * white disappears on a card.
 */
export function Chip({
  tone = "neutral",
  variant = "soft",
  className,
  children,
}: {
  tone?: Tone;
  variant?: "soft" | "solid" | "onDark";
  className?: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  const style =
    variant === "solid"
      ? { background: t.solid, color: "#fff" }
      : variant === "onDark"
        ? { background: t.onDark.bg, color: t.onDark.fg }
        : { background: t.soft, color: t.fg };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-[10.5px] font-extrabold uppercase tracking-wide whitespace-nowrap",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
   MiniStat — the grey rounded figure box.
   ──────────────────────────────────────────────────────────────── */

/** Small label-over-figure box. Grid several of these inside a card. */
export function MiniStat({
  label,
  value,
  suffix,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl bg-slate-50 px-3.5 py-2.5", className)}>
      <div className={clsx(TYPO.microLabel, "truncate")}>{label}</div>
      <div className={clsx("mt-0.5", TYPO.statValue)}>
        {value}
        {suffix != null && (
          <small className="ml-0.5 text-[12px] font-bold text-slate-400">{suffix}</small>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   StatTile — the gradient tile from the top of the Summary tab.
   ──────────────────────────────────────────────────────────────── */

/**
 * Gradient KPI tile. `index` picks the colour so a row of tiles keeps the
 * violet → cyan → green → amber order the dashboard and Summary tab use.
 */
export function StatTile({
  icon: Icon,
  value,
  suffix,
  label,
  index = 0,
}: {
  icon: LucideIcon;
  value: ReactNode;
  suffix?: ReactNode;
  label: ReactNode;
  index?: number;
}) {
  const i = index % GRADIENTS.length;
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-4 py-3.5 text-white"
      style={{ background: GRADIENTS[i] }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/20">
        <Icon size={16} strokeWidth={2.4} />
      </span>
      <div className="mt-3 text-[26px] font-extrabold leading-none tabular-nums tracking-tight">
        {value}
        {suffix != null && <small className="ml-0.5 text-[13px] font-bold">{suffix}</small>}
      </div>
      <div className="mt-1 text-[11.5px] font-semibold text-white/80">{label}</div>
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full"
        viewBox="0 0 200 32"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={SPARK_PATHS[i]} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="2" />
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   ShareBar — stacked distribution bar and single-track bar.
   ──────────────────────────────────────────────────────────────── */

export interface ShareSegment {
  /** Percent of the track. Segments need not sum to 100 — the remainder
   *  renders as unfilled track, which is how a single-value bar works. */
  percent: number;
  tone?: Tone;
  /** Overrides the tone's bar gradient. */
  background?: string;
  key?: string;
}

/**
 * Horizontal share bar. One segment gives a progress track; several give a
 * stacked distribution. `ends` labels the two extremes underneath.
 */
export function ShareBar({
  segments,
  ends,
  height = 12,
  className,
}: {
  segments: ShareSegment[];
  ends?: [ReactNode, ReactNode];
  height?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className="flex w-full overflow-hidden rounded-full bg-slate-100"
        style={{ height }}
      >
        {segments.map((s, i) => (
          <div
            key={s.key ?? i}
            style={{
              width: `${Math.max(0, Math.min(100, s.percent))}%`,
              background: s.background ?? TONE[s.tone ?? "neutral"].bar,
            }}
          />
        ))}
      </div>
      {ends && (
        <div className="mt-1 flex justify-between text-[10.5px] font-semibold text-slate-400">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   ToneCallout — banner for a warning, caveat or conclusion.
   ──────────────────────────────────────────────────────────────── */

/**
 * Tinted block with a coloured left rule. Use for the things a reader must
 * not skim past — a tie warning, a cross-check disagreement, a caveat that
 * qualifies the numbers above it.
 */
export function ToneCallout({
  tone = "warn",
  title,
  icon: Icon,
  actions,
  className,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={clsx("rounded-xl border-l-[3px] px-4 py-3", className)}
      style={{ background: t.soft, borderColor: t.solid }}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon size={15} strokeWidth={2.4} style={{ color: t.fg }} />}
            {title && (
              <strong className="text-[13px] font-extrabold" style={{ color: t.fg }}>
                {title}
              </strong>
            )}
          </div>
          {actions}
        </div>
      )}
      {children && (
        <div className={clsx(title ? "mt-1.5" : undefined, "text-[12.5px] leading-relaxed text-slate-600")}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   DataTable — the one primitive with no precedent in the Summary tab.
   ──────────────────────────────────────────────────────────────── */

export interface DataColumn<Row> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Return a node; formatting belongs to the caller. */
  cell: (row: Row, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  /** Applied to both header and cells. */
  className?: string;
}

/**
 * Table shell for the eighteen hand-rolled `<table>`s across the tabs.
 *
 * The Summary tab has no table, so this establishes the convention rather
 * than inheriting one: hairline row dividers instead of borders, uppercase
 * micro column heads, tabular figures, and a horizontal scroll container
 * so wide tables stop overflowing on phones (only one of the existing
 * tables handled that).
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  className,
  rowClassName,
}: {
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  empty?: ReactNode;
  className?: string;
  rowClassName?: (row: Row, index: number) => string | undefined;
}) {
  if (rows.length === 0 && empty) {
    return <div className={clsx(TYPO.cardBody, "py-6 text-center")}>{empty}</div>;
  }
  return (
    <div className={clsx("-mx-1 overflow-x-auto px-1", className)}>
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  TYPO.colHead,
                  "whitespace-nowrap px-3 pb-2 first:pl-0 last:pr-0",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  !c.align && "text-left",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className={rowClassName?.(row, i)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx(
                    TYPO.cell,
                    "px-3 py-2.5 align-middle first:pl-0 last:pr-0",
                    c.align === "right" && "text-right tabular-nums",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
