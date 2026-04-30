"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import type { Persona, PricingResult } from "@/lib/simulation/schemas";

export function PricingTab({
  pricing,
  currency,
  personas = [],
}: {
  pricing: PricingResult;
  currency: string;
  personas?: Persona[];
}) {
  const t = useTranslations("results.pricing");
  const tWhy = useTranslations("results.pricing.why");

  const data = pricing.curve.map((p) => ({
    priceCents: p.priceCents,
    price: (p.priceCents / 100).toFixed(2),
    [t("conversion")]: Number((p.conversionProbability * 100).toFixed(2)),
    [t("revenue")]: Number(p.estimatedRevenueIndex.toFixed(2)),
  }));

  // The recommended price might not match a curve point exactly — find nearest
  // so the marker dot lands on a real datapoint instead of floating.
  const nearestIdx = pricing.curve.reduce((bestIdx, p, idx) => {
    const cur = Math.abs(p.priceCents - pricing.recommendedPriceCents);
    const best = Math.abs(pricing.curve[bestIdx].priceCents - pricing.recommendedPriceCents);
    return cur < best ? idx : bestIdx;
  }, 0);
  const recommendedPoint = data[nearestIdx];
  const peakRevenuePoint = data.reduce(
    (best, cur) => (cur[t("revenue")] > best[t("revenue")] ? cur : best),
    data[0],
  );

  // Persona-driven rationale: how price-sensitive is this audience?
  // Higher % "high" → lower price wins; higher % "low" → premium price viable.
  const total = personas.length;
  const sensitivity = personas.reduce(
    (acc, p) => {
      acc[p.priceSensitivity] = (acc[p.priceSensitivity] ?? 0) + 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 } as Record<"low" | "medium" | "high", number>,
  );
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            {t("priceVsConversion")}
          </h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="price" tickLine={false} stroke="#64748b" fontSize={12} />
                <YAxis tickLine={false} stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={t("conversion")}
                  stroke="#0B2A5B"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey={t("revenue")}
                  stroke="#06B6D4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                {recommendedPoint && (
                  <ReferenceDot
                    x={recommendedPoint.price}
                    y={recommendedPoint[t("revenue")]}
                    r={6}
                    fill="#16a34a"
                    stroke="#fff"
                    strokeWidth={2}
                    label={{
                      value: tWhy("recommendedMarker"),
                      position: "top",
                      fontSize: 10,
                      fill: "#16a34a",
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card space-y-5">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>{t("recommendedPrice")}</span>
              <HelpTooltip text={t("help.recommendedPrice")} />
            </div>
            <div className="mt-2 text-3xl font-semibold text-brand tabular-nums leading-none">
              {(pricing.recommendedPriceCents / 100).toLocaleString(undefined, {
                style: "currency",
                currency,
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              <span>{t("marginEstimate")}</span>
              <HelpTooltip text={t("help.marginEstimate")} />
            </div>
            <p className="prose-body">{pricing.marginEstimate}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
          {tWhy("title")}
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="text-xs font-medium text-slate-700 mb-3">
              {tWhy("sensitivity")}{" "}
              <span className="text-slate-400 font-normal">
                ({tWhy("basedOn", { n: total })})
              </span>
            </div>
            {total === 0 ? (
              <p className="text-xs text-slate-500">{tWhy("noPersonas")}</p>
            ) : (
              <SensitivityBar
                low={sensitivity.low}
                medium={sensitivity.medium}
                high={sensitivity.high}
                pct={pct}
              />
            )}
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              {pct(sensitivity.high) > pct(sensitivity.low)
                ? tWhy("interpHigh")
                : pct(sensitivity.low) > pct(sensitivity.high)
                  ? tWhy("interpLow")
                  : tWhy("interpMixed")}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <Row
              label={tWhy("recommendedAt")}
              value={
                recommendedPoint
                  ? `${recommendedPoint.price} ${currency}`
                  : "—"
              }
              hint={
                recommendedPoint
                  ? tWhy("recommendedHint", {
                      conv: recommendedPoint[t("conversion")] as number,
                      rev: recommendedPoint[t("revenue")] as number,
                    })
                  : undefined
              }
            />
            <Row
              label={tWhy("peakRevenue")}
              value={peakRevenuePoint ? `${peakRevenuePoint.price} ${currency}` : "—"}
              hint={
                peakRevenuePoint
                  ? tWhy("peakHint", {
                      rev: peakRevenuePoint[t("revenue")] as number,
                    })
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SensitivityBar({
  low,
  medium,
  high,
  pct,
}: {
  low: number;
  medium: number;
  high: number;
  pct: (n: number) => number;
}) {
  const lowPct = pct(low);
  const medPct = pct(medium);
  const highPct = pct(high);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        {lowPct > 0 && (
          <div className="bg-success" style={{ width: `${lowPct}%` }} title={`low ${lowPct}%`} />
        )}
        {medPct > 0 && (
          <div className="bg-warn" style={{ width: `${medPct}%` }} title={`medium ${medPct}%`} />
        )}
        {highPct > 0 && (
          <div className="bg-risk" style={{ width: `${highPct}%` }} title={`high ${highPct}%`} />
        )}
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-600 tabular-nums">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-success mr-1.5" />
          Low {lowPct}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-warn mr-1.5" />
          Med {medPct}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-risk mr-1.5" />
          High {highPct}%
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-sm text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 leading-relaxed">{hint}</div>}
    </div>
  );
}
