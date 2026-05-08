/**
 * Shared comparison primitives used by both same-project and cross-project
 * ensemble comparison pages. Extracted so the two pages don't drift apart
 * on visual / numeric details — they're presenting the same conceptual
 * comparison, just with different selectors and context above.
 */
import { ArrowLeft, ArrowRight, Minus } from "lucide-react";
import { clsx } from "clsx";
import { CountryChip } from "@/components/ui/CountryChip";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </h2>
  );
}

export function TierBadge({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs font-bold uppercase tracking-wider bg-brand/10 text-brand px-2 py-1 rounded">
      {label}
    </span>
  );
}

/**
 * Small (?) circle that shows a tooltip on hover. Reused across the
 * comparison cards so every metric can carry its own one-sentence
 * explanation without each card re-defining the styling.
 */
function HelpDot({ tooltip }: { tooltip: string }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold cursor-help shrink-0"
    >
      ?
    </span>
  );
}

export function CompareKpi({
  label,
  a,
  b,
  format,
  higherIsBetter,
  currency,
  tooltip,
}: {
  label: string;
  a: number | undefined;
  b: number | undefined;
  format: (v: number | undefined) => string;
  higherIsBetter?: boolean;
  currency?: string;
  tooltip?: string;
}) {
  const delta = a !== undefined && b !== undefined && a !== b ? b - a : undefined;
  const deltaSign =
    delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone =
    delta === undefined || higherIsBetter === undefined
      ? "neutral"
      : (higherIsBetter && deltaSign === "up") ||
          (!higherIsBetter && deltaSign === "down")
        ? "good"
        : deltaSign === "flat"
          ? "neutral"
          : "bad";
  // Tinted left border on directional deltas — gives a glanceable
  // signal of "is this metric moving the right way?" without forcing
  // the reader to compute mentally. Neutral / unknown stays neutral.
  const borderClass =
    tone === "good"
      ? "border-l-success border-l-2"
      : tone === "bad"
        ? "border-l-risk border-l-2"
        : "";
  return (
    <div
      className={clsx(
        "rounded-lg border border-slate-200 p-4 bg-slate-50/40",
        borderClass,
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <span>{label}</span>
        {tooltip && <HelpDot tooltip={tooltip} />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="font-mono text-slate-900">{format(a)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="font-mono text-slate-900">{format(b)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <DeltaBadge sign={deltaSign} tone={tone} />
        {delta !== undefined && (
          <span className="text-slate-500 tabular-nums">
            Δ {delta > 0 ? "+" : ""}
            {currency ? delta.toFixed(2) : Math.round(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

export function CompareInfo({
  label,
  a,
  b,
  tooltip,
}: {
  label: string;
  a: string | undefined;
  b: string | undefined;
  tooltip?: string;
}) {
  const same = a === b;
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <span>{label}</span>
        {tooltip && <HelpDot tooltip={tooltip} />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="text-slate-900 font-medium">{a ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="text-slate-900 font-medium">{b ?? "—"}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{same ? "—" : "≠"}</div>
    </div>
  );
}

export function DeltaBadge({
  sign,
  tone,
}: {
  sign: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}) {
  const Icon = sign === "up" ? ArrowRight : sign === "down" ? ArrowLeft : Minus;
  const cls =
    tone === "good"
      ? "bg-success-soft text-success"
      : tone === "bad"
        ? "bg-risk-soft text-risk"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cls}`}>
      <Icon
        size={11}
        className={
          sign === "up" ? "rotate-[-45deg]" : sign === "down" ? "rotate-[-135deg]" : ""
        }
      />
    </span>
  );
}

export function DistributionPanel({
  title,
  distribution,
  winner,
  simCount,
  locale,
}: {
  title: string;
  distribution: EnsembleAggregate["bestCountryDistribution"];
  winner?: string;
  simCount: number;
  locale: string;
}) {
  void locale;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {distribution.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <div className="space-y-2">
          {distribution.map((b) => {
            const isWinner = b.country === winner;
            return (
              <div key={b.country} className="flex items-center gap-3 text-sm">
                <CountryChip code={b.country} size="sm" />
                <div className="w-10 font-medium text-slate-700">{b.country}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${isWinner ? "bg-success" : "bg-slate-300"}`}
                    style={{ width: `${b.percent}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                  {b.count}/{simCount} ({b.percent}%)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RiskPanel({
  title,
  risks,
  isKo,
}: {
  title: string;
  risks: NonNullable<EnsembleAggregate["narrative"]>["mergedRisks"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {risks.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ul className="space-y-3">
          {risks.map((r, i) => {
            const sevClass =
              r.severity === "high"
                ? "text-risk"
                : r.severity === "medium"
                  ? "text-warn"
                  : "text-slate-500";
            return (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[10px] font-bold uppercase ${sevClass}`}>
                    {r.severity}
                  </span>
                  <span className="font-semibold text-slate-900">{r.factor}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{r.description}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${r.surfacedInSims}개 시뮬에서 언급`
                    : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ActionPanel({
  title,
  actions,
  isKo,
}: {
  title: string;
  actions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {actions.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-brand font-bold shrink-0">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-slate-700 leading-relaxed">{a.action}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${a.surfacedInSims}개 시뮬에서 권장`
                    : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Side-by-side hot-take comparison panel. F-batch shipped a single-line
 * "30-second hot take" per ensemble — stacking two of them on the
 * compare page is the highest-density readable signal of "what
 * changed."
 *
 * Renders inline emoji + decision text. Falls through silently when
 * either ensemble lacks a hotTake (legacy narrative).
 */
export function HotTakeCompare({
  aTitle,
  bTitle,
  a,
  b,
  isKo,
}: {
  aTitle: string;
  bTitle: string;
  a?: string;
  b?: string;
  isKo: boolean;
}) {
  if (!a && !b) return null;
  return (
    <div className="card p-5 bg-gradient-to-r from-brand-50/40 to-accent-50/40 border-2 border-accent/30">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent mb-3">
        {isKo ? "30초 핫테이크" : "30-second hot take"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {aTitle}
          </div>
          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug break-keep">
            {a ?? <span className="text-slate-400 font-normal">—</span>}
          </p>
        </div>
        <div className="md:border-l md:border-slate-200 md:pl-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {bTitle}
          </div>
          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug break-keep">
            {b ?? <span className="text-slate-400 font-normal">—</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Action overlap diff — splits A's and B's top actions into:
 *   - Common: same action surfaces in both
 *   - Only in A
 *   - Only in B
 *
 * Same-action detection is by lowercased + space-collapsed substring
 * match on the first 60 chars (cheap, deterministic; matches the
 * dedup heuristic used by the merge LLM). Designed for at-a-glance
 * "did changing the price keep the same actions?" reads.
 */
export function ActionOverlap({
  aTitle,
  bTitle,
  aActions,
  bActions,
  isKo,
}: {
  aTitle: string;
  bTitle: string;
  aActions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  bActions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  isKo: boolean;
}) {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
  const aKeys = new Map(aActions.map((a) => [norm(a.action), a]));
  const bKeys = new Map(bActions.map((b) => [norm(b.action), b]));
  const common = aActions.filter((a) => bKeys.has(norm(a.action)));
  const onlyA = aActions.filter((a) => !bKeys.has(norm(a.action)));
  const onlyB = bActions.filter((b) => !aKeys.has(norm(b.action)));

  if (common.length + onlyA.length + onlyB.length === 0) return null;

  return (
    <div className="card p-5">
      <SectionTitle>{isKo ? "액션 중복 / 차이" : "Action overlap"}</SectionTitle>
      <p className="text-xs text-slate-500 mt-2 mb-3 break-keep leading-relaxed">
        {isKo
          ? "두 분석 모두 권장한 액션 vs 한쪽에서만 새로 등장한 액션. 입력이 달라져 새로 떠오른 액션은 변화의 직접적 시그널입니다."
          : "Actions both runs recommend vs ones that surfaced on only one side. New-to-one actions are the direct signal of how the change shifted strategy."}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <OverlapCol
          title={isKo ? `공통 (${common.length})` : `Common (${common.length})`}
          tone="success"
          items={common.map((a) => a.action)}
        />
        <OverlapCol
          title={isKo ? `${aTitle}만 (${onlyA.length})` : `${aTitle} only (${onlyA.length})`}
          tone="brand"
          items={onlyA.map((a) => a.action)}
        />
        <OverlapCol
          title={isKo ? `${bTitle}만 (${onlyB.length})` : `${bTitle} only (${onlyB.length})`}
          tone="warn"
          items={onlyB.map((a) => a.action)}
        />
      </div>
    </div>
  );
}

function OverlapCol({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "success" | "brand" | "warn";
  items: string[];
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40 bg-success-soft/30"
      : tone === "brand"
        ? "border-brand/40 bg-brand-50/30"
        : "border-warn/40 bg-warn-soft/30";
  const dotClass =
    tone === "success" ? "bg-success" : tone === "brand" ? "bg-brand" : "bg-warn";
  return (
    <div className={`rounded-md border ${toneClass} p-3`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-2">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${dotClass}`} />
              <span className="text-xs text-slate-700 leading-snug">{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Channel / brand mention diff. F-batch surfaced channel mentions
 * (Amazon, TikTok, Sephora, etc.) extracted from persona free-text.
 * On compare, this answers "did the new conditions change which
 * channels matter?" — useful for pricing / positioning experiments.
 *
 * Visual: top 5 from each side, with a delta column when both sides
 * mentioned the same channel. Channels unique to one side are
 * highlighted with a colored dot.
 */
type ChannelRow = {
  channel: string;
  mentions: number;
  share: number;
  meanIntent: number;
};
export function ChannelMentionCompare({
  aTitle,
  bTitle,
  aChannels,
  bChannels,
  isKo,
}: {
  aTitle: string;
  bTitle: string;
  aChannels?: ChannelRow[];
  bChannels?: ChannelRow[];
  isKo: boolean;
}) {
  if (!aChannels?.length && !bChannels?.length) return null;
  const aMap = new Map((aChannels ?? []).map((c) => [c.channel, c]));
  const bMap = new Map((bChannels ?? []).map((c) => [c.channel, c]));
  // Combined top-N: any channel that appears in either side's top 7.
  const channels = new Set<string>();
  (aChannels ?? []).slice(0, 7).forEach((c) => channels.add(c.channel));
  (bChannels ?? []).slice(0, 7).forEach((c) => channels.add(c.channel));

  return (
    <div className="card p-5">
      <SectionTitle>{isKo ? "채널 · 브랜드 멘션 비교" : "Channel / brand mention diff"}</SectionTitle>
      <p className="text-xs text-slate-500 mt-2 mb-4 break-keep leading-relaxed">
        {isKo
          ? "페르소나가 자연스럽게 언급한 유통/광고 채널입니다. 한쪽에만 등장한 채널은 입력 변화로 새로 활성화된 신호."
          : "Channels personas naturally mentioned. Channels appearing on only one side signal a new touchpoint surfaced by the input change."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left py-2 pr-3 font-medium">{isKo ? "채널" : "Channel"}</th>
              <th className="text-right py-2 px-3 font-medium">
                {aTitle}
              </th>
              <th className="text-right py-2 px-3 font-medium">
                {bTitle}
              </th>
              <th className="text-right py-2 pl-3 font-medium">{isKo ? "변화" : "Δ"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...channels].slice(0, 10).map((ch) => {
              const a = aMap.get(ch);
              const b = bMap.get(ch);
              const aShare = a?.share ?? null;
              const bShare = b?.share ?? null;
              const delta =
                aShare != null && bShare != null ? bShare - aShare : null;
              const tone =
                !a ? "warn" : !b ? "brand" : delta != null && Math.abs(delta) >= 5 ? "neutral" : null;
              const dotClass =
                tone === "warn"
                  ? "bg-warn"
                  : tone === "brand"
                    ? "bg-brand"
                    : tone === "neutral"
                      ? "bg-slate-400"
                      : "";
              return (
                <tr key={ch}>
                  <td className="py-2 pr-3 font-medium text-slate-800 flex items-center gap-2">
                    {tone && <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotClass}`} />}
                    <span>{ch}</span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                    {aShare != null ? `${aShare}%` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                    {bShare != null ? `${bShare}%` : <span className="text-slate-300">—</span>}
                  </td>
                  <td
                    className={`py-2 pl-3 text-right tabular-nums font-semibold ${
                      delta == null
                        ? "text-slate-300"
                        : delta > 0
                          ? "text-success"
                          : delta < 0
                            ? "text-risk"
                            : "text-slate-400"
                    }`}
                  >
                    {delta == null
                      ? !a
                        ? isKo ? "신규" : "new"
                        : isKo ? "사라짐" : "gone"
                      : `${delta > 0 ? "+" : ""}${delta}pt`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
