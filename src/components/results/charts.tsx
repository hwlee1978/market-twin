"use client";

/**
 * Recharts wrappers for the ensemble dashboard. All chart components
 * live here so the EnsembleView file (already large) doesn't bloat
 * further with chart config noise. Each chart is a small client-side
 * component receiving already-aggregated data — no derivations here.
 *
 * Colours come from results/ui/tokens as literal hex. Recharts writes
 * colours as SVG attributes, where a CSS variable resolves to nothing,
 * so the chart palette cannot go through `var(--color-…)` the way the
 * rest of the results page does.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ErrorBar,
} from "recharts";
import { formatPrice } from "@/lib/format/price";
import { CHART, CHART_TICK, CHART_TOOLTIP } from "./ui/tokens";

const COLORS = {
  ...CHART,
  // Soft fills used only for histogram bucket tinting.
  successSoft: "#86efac",
  warnSoft: "#fde68a",
};

const PIE_COLORS = [COLORS.success, COLORS.brand, COLORS.warn, COLORS.muted, COLORS.brandLight];

/* ────────────────────────────────── persona intent histogram ─── */

export function IntentHistogramChart({
  data,
}: {
  data: Array<{ binStart: number; binEnd: number; count: number }>;
}) {
  // Color the bins by intent zone: low (red), neutral (slate), high (green)
  // — same encoding as the per-sim dashboard so the user's mental model
  // transfers across views.
  const enriched = data.map((d) => ({
    label: `${d.binStart}–${d.binEnd === 100 ? 100 : d.binEnd - 1}`,
    count: d.count,
    fill:
      d.binStart >= 70
        ? COLORS.success
        : d.binStart < 35
          ? COLORS.warn
          : COLORS.brandLight,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={enriched} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 5" stroke={COLORS.divider} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK} interval={0} />
        <YAxis tick={CHART_TICK} allowDecimals={false} />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value) => [Number(value).toLocaleString(), "personas"] as [string, string]}
        />
        <Bar dataKey="count" radius={[5, 5, 0, 0]}>
          {enriched.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ────────────────────────────────── per-country mean intent ─── */

export function CountryIntentChart({
  data,
}: {
  data: Array<{ country: string; meanIntent: number; count: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32 + 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 32, left: 16, bottom: 0 }}
      >
        <defs>
          <linearGradient id="mtBarH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={COLORS.brand} />
            <stop offset="100%" stopColor={COLORS.accent} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 5" stroke={COLORS.divider} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={CHART_TICK}
        />
        <YAxis
          type="category"
          dataKey="country"
          width={40}
          tick={{ fontSize: 11, fill: COLORS.brand, fontWeight: 600 }}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value, _name, item) => {
            const p = (item as { payload?: { count?: number; country?: string } }).payload ?? {};
            return [`${Number(value)}% intent · n=${p.count}`, p.country ?? ""] as [string, string];
          }}
        />
        <Bar dataKey="meanIntent" fill="url(#mtBarH)" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ────────────────────────────────── country final-score chart ─── */

export function CountryScoreChart({
  data,
}: {
  data: Array<{ country: string; mean: number; min: number; max: number }>;
}) {
  // Bar with min/max range overlaid — gives the user the headline number
  // (mean) plus the variance signal (range bracket) at a glance.
  const enriched = data.map((d) => ({
    country: d.country,
    mean: d.mean,
    min: d.min,
    max: d.max,
    range: d.max - d.min,
    // recharts wants the whisker as [distance below, distance above] the
    // plotted value, not absolute bounds.
    errorRange: [Math.max(0, d.mean - d.min), Math.max(0, d.max - d.mean)] as [number, number],
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36 + 40)}>
      <BarChart
        data={enriched}
        layout="vertical"
        margin={{ top: 8, right: 32, left: 16, bottom: 0 }}
      >
        <defs>
          <linearGradient id="mtBarScore" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={COLORS.brand} />
            <stop offset="100%" stopColor={COLORS.accent} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 5" stroke={COLORS.divider} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={CHART_TICK}
        />
        <YAxis
          type="category"
          dataKey="country"
          width={40}
          tick={{ fontSize: 11, fill: COLORS.brand, fontWeight: 600 }}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value, name, item) => {
            const p = (item as { payload?: { min?: number; max?: number } }).payload ?? {};
            if (name === "mean") {
              return [`${Number(value)} (range ${p.min}–${p.max})`, "score"] as [string, string];
            }
            return [String(value), String(name)] as [string, string];
          }}
        />
        <Bar dataKey="mean" fill="url(#mtBarScore)" radius={[0, 5, 5, 0]}>
          {/* The min–max whisker the guide has always described. min and
              max were computed and passed in, and the comment above
              claims a "range bracket", but nothing ever drew one — so
              the explanation pointed at a mark that wasn't on the chart.
              Without it the bar reads as a precise value rather than the
              middle of a spread. */}
          <ErrorBar
            dataKey="errorRange"
            direction="x"
            width={5}
            strokeWidth={1.5}
            stroke={COLORS.muted}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ────────────────────────────────── pricing curve ─── */

export function PricingCurveChart({
  data,
  currency = "USD",
  isKo = true,
}: {
  data: Array<{ priceCents: number; meanConversionProbability: number; sampleCount: number }>;
  /** ISO currency code from the project — drives the X-axis label format.
      Defaults to USD for legacy callers that haven't been updated yet. */
  currency?: string;
  isKo?: boolean;
}) {
  // Client-side re-bucketing. Aggregator-side bucketing was added later,
  // so existing ensembles still carry noisy curves with adjacent points
  // (₩134,090 + ₩134,390 etc.). We re-collapse on render to ~12-15
  // smooth buckets regardless of when the data was persisted. Same
  // proportional-window algorithm as the aggregator.
  const bucketed = (() => {
    if (data.length === 0) return [];
    const prices = data.map((d) => d.priceCents);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP;
    if (range <= 0) return data;
    let bucketSize = Math.max(1, Math.round(range / 15));
    const magnitude = Math.pow(10, Math.floor(Math.log10(bucketSize)));
    bucketSize = Math.max(magnitude, Math.round(bucketSize / magnitude) * magnitude);
    const buckets = new Map<number, { sum: number; count: number; n: number }>();
    for (const d of data) {
      const key = Math.round(d.priceCents / bucketSize) * bucketSize;
      const cur = buckets.get(key) ?? { sum: 0, count: 0, n: 0 };
      cur.sum += d.meanConversionProbability;
      cur.count += 1;
      cur.n += d.sampleCount;
      buckets.set(key, cur);
    }
    return [...buckets.entries()]
      .map(([priceCents, v]) => ({
        priceCents,
        meanConversionProbability: v.sum / v.count,
        sampleCount: v.n,
      }))
      .sort((a, b) => a.priceCents - b.priceCents);
  })();
  // Monotonic envelope overlay — running min of conversion as price
  // ascends. Visible as a dashed line so the user can SEE what the
  // algorithm uses for revenue-max computation vs the raw LLM output.
  // Le Mouton 1265510e curve drifts up after $220 (LLM emitted
  // $260=45%, $300=60%) — the envelope clamps those to the prior
  // running min, surfacing the high-price bumps as suppressed noise
  // rather than treating them as real demand growth.
  const enriched = bucketed.reduce<
    { price: string; priceCents: number; conv: number; envelope: number; n: number }[]
  >((acc, d) => {
    const prevMin = acc.length > 0 ? acc[acc.length - 1].envelope / 10 : Infinity;
    const envelopeRaw = Math.min(prevMin, d.meanConversionProbability);
    acc.push({
      price: formatPrice(d.priceCents, currency),
      priceCents: d.priceCents,
      conv: Math.round(d.meanConversionProbability * 1000) / 10, // raw %
      envelope: Math.round(envelopeRaw * 1000) / 10, // envelope %
      n: d.sampleCount,
    });
    return acc;
  }, []);
  // Only show envelope line when it actually diverges from raw —
  // monotonic curves overlap perfectly and the dashed line just adds
  // visual clutter.
  const envelopeDiverges = enriched.some(
    (d) => Math.abs(d.conv - d.envelope) > 0.5,
  );
  return (
    <>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={enriched} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 5" stroke={COLORS.divider} />
        <XAxis dataKey="price" tick={CHART_TICK} interval="preserveStartEnd" />
        <YAxis
          unit="%"
          tick={CHART_TICK}
          domain={[0, "dataMax"]}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value, name, item) => {
            const p = (item as { payload?: { n?: number; price?: string } }).payload ?? {};
            const label =
              name === "envelope"
                ? `${Number(value)}% envelope (clamped)`
                : `${Number(value)}% raw conv (n=${p.n})`;
            return [label, p.price ?? ""] as [string, string];
          }}
          labelFormatter={() => ""}
        />
        {/* Raw LLM conversion — drawn first (background) and de-emphasized:
            light grey dashed, no dots. Only when it diverges from the
            envelope, since on a clean monotonic curve the two coincide.
            (Swapped 2026-06: raw used to be the bold blue line, but its
            non-monotonic noise misled users into thinking the chart was
            wrong. The envelope — what the recommendation actually uses —
            is now the emphasized line.) */}
        {envelopeDiverges && (
          <Line
            type="monotone"
            dataKey="conv"
            stroke={COLORS.muted}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            strokeOpacity={0.55}
            dot={false}
            name="raw"
            isAnimationActive={false}
          />
        )}
        {/* Monotonic envelope — the curve the recommendation / revenue-max
            actually use. Emphasized: solid brand line with dots. Always
            shown (on a monotonic curve it equals the raw values). */}
        <Line
          type="monotone"
          dataKey="envelope"
          stroke={COLORS.accent}
          strokeWidth={2.5}
          dot={{ r: 3, fill: COLORS.accent }}
          name="envelope"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    {/* The dashed raw line only exists when it diverges, so its
        explanation lives here rather than in the caller — describing a
        mark that is not on the chart is worse than not describing it. */}
    {envelopeDiverges && (
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
        {isKo
          ? "회색 점선은 다듬기 전의 원본 추정치입니다. AI가 가격대별로 따로 추정하기 때문에 오르내림이 생기는데, 참고용이며 판단에는 쓰지 않습니다."
          : "The grey dashed line is the raw estimate before smoothing. The model prices each point independently, so it wobbles; it is shown for reference and not used in any decision."}
      </p>
    )}
    </>
  );
}

/* ────────────────────────────────── bestCountry distribution ─── */

export function BestCountryPieChart({
  data,
  winner,
}: {
  data: Array<{ country: string; count: number; percent: number }>;
  winner: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="country"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={88}
          paddingAngle={2}
          label={(entry: { country?: string; percent?: number }) =>
            `${entry.country ?? ""} ${entry.percent ?? 0}%`
          }
          labelLine={false}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.country === winner ? COLORS.success : PIE_COLORS[(i + 1) % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value, _name, item) => {
            const p = (item as { payload?: { percent?: number; country?: string } }).payload ?? {};
            return [`${Number(value)} sims (${p.percent}%)`, p.country ?? ""] as [string, string];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}
