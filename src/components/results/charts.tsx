"use client";

/**
 * Recharts wrappers for the ensemble dashboard. All chart components
 * live here so the EnsembleView file (already large) doesn't bloat
 * further with chart config noise. Each chart is a small client-side
 * component receiving already-aggregated data — no derivations here.
 *
 * Color palette is kept inline (matched to Tailwind tokens used in
 * EnsembleView) to avoid a roundtrip through CSS variables that
 * recharts can't read at SVG-attribute time.
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
} from "recharts";
import { formatPrice } from "@/lib/format/price";

const COLORS = {
  brand: "#0A1F4D",
  brandLight: "#3B5BA9",
  success: "#16A34A",
  successSoft: "#86EFAC",
  warn: "#CA8A04",
  warnSoft: "#FDE68A",
  risk: "#DC2626",
  muted: "#94A3B8",
  divider: "#E2E8F0",
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
        <CartesianGrid strokeDasharray="2 4" stroke={COLORS.divider} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: COLORS.muted }} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: `1px solid ${COLORS.divider}`,
            borderRadius: 4,
          }}
          formatter={(value) => [Number(value).toLocaleString(), "personas"] as [string, string]}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
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
        <CartesianGrid strokeDasharray="2 4" stroke={COLORS.divider} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: COLORS.muted }}
        />
        <YAxis
          type="category"
          dataKey="country"
          width={40}
          tick={{ fontSize: 11, fill: COLORS.brand, fontWeight: 600 }}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, border: `1px solid ${COLORS.divider}`, borderRadius: 4 }}
          formatter={(value, _name, item) => {
            const p = (item as { payload?: { count?: number; country?: string } }).payload ?? {};
            return [`${Number(value)}% intent · n=${p.count}`, p.country ?? ""] as [string, string];
          }}
        />
        <Bar dataKey="meanIntent" fill={COLORS.brand} radius={[0, 3, 3, 0]} />
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
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36 + 40)}>
      <BarChart
        data={enriched}
        layout="vertical"
        margin={{ top: 8, right: 32, left: 16, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="2 4" stroke={COLORS.divider} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: COLORS.muted }}
        />
        <YAxis
          type="category"
          dataKey="country"
          width={40}
          tick={{ fontSize: 11, fill: COLORS.brand, fontWeight: 600 }}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, border: `1px solid ${COLORS.divider}`, borderRadius: 4 }}
          formatter={(value, name, item) => {
            const p = (item as { payload?: { min?: number; max?: number } }).payload ?? {};
            if (name === "mean") {
              return [`${Number(value)} (range ${p.min}–${p.max})`, "score"] as [string, string];
            }
            return [String(value), String(name)] as [string, string];
          }}
        />
        <Bar dataKey="mean" fill={COLORS.brand} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ────────────────────────────────── pricing curve ─── */

export function PricingCurveChart({
  data,
  currency = "USD",
}: {
  data: Array<{ priceCents: number; meanConversionProbability: number; sampleCount: number }>;
  /** ISO currency code from the project — drives the X-axis label format.
      Defaults to USD for legacy callers that haven't been updated yet. */
  currency?: string;
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
  let runningMin = Infinity;
  const enriched = bucketed.map((d) => {
    runningMin = Math.min(runningMin, d.meanConversionProbability);
    return {
      price: formatPrice(d.priceCents, currency),
      priceCents: d.priceCents,
      conv: Math.round(d.meanConversionProbability * 1000) / 10, // raw %
      envelope: Math.round(runningMin * 1000) / 10, // envelope %
      n: d.sampleCount,
    };
  });
  // Only show envelope line when it actually diverges from raw —
  // monotonic curves overlap perfectly and the dashed line just adds
  // visual clutter.
  const envelopeDiverges = enriched.some(
    (d) => Math.abs(d.conv - d.envelope) > 0.5,
  );
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={enriched} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke={COLORS.divider} />
        <XAxis dataKey="price" tick={{ fontSize: 10, fill: COLORS.muted }} interval="preserveStartEnd" />
        <YAxis
          unit="%"
          tick={{ fontSize: 10, fill: COLORS.muted }}
          domain={[0, "dataMax"]}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, border: `1px solid ${COLORS.divider}`, borderRadius: 4 }}
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
        <Line
          type="monotone"
          dataKey="conv"
          stroke={COLORS.brand}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.brand }}
          name="raw"
          isAnimationActive={false}
        />
        {envelopeDiverges && (
          <Line
            type="monotone"
            dataKey="envelope"
            stroke={COLORS.warn}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2, fill: COLORS.warn }}
            name="envelope"
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
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
          contentStyle={{ fontSize: 12, border: `1px solid ${COLORS.divider}`, borderRadius: 4 }}
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
