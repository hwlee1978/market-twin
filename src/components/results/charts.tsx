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
}: {
  data: Array<{ priceCents: number; meanConversionProbability: number; sampleCount: number }>;
}) {
  const enriched = data.map((d) => ({
    price: `$${(d.priceCents / 100).toFixed(2)}`,
    priceCents: d.priceCents,
    conv: Math.round(d.meanConversionProbability * 1000) / 10, // %
    n: d.sampleCount,
  }));
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
          formatter={(value, _name, item) => {
            const p = (item as { payload?: { n?: number; price?: string } }).payload ?? {};
            return [`${Number(value)}% conv (n=${p.n})`, p.price ?? ""] as [string, string];
          }}
          labelFormatter={() => ""}
        />
        <Line
          type="monotone"
          dataKey="conv"
          stroke={COLORS.brand}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.brand }}
        />
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
