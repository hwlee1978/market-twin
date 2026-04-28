"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricingResult } from "@/lib/simulation/schemas";

export function PricingTab({ pricing, currency }: { pricing: PricingResult; currency: string }) {
  const t = useTranslations("results.pricing");
  const data = pricing.curve.map((p) => ({
    price: (p.priceCents / 100).toFixed(2),
    [t("conversion")]: Number((p.conversionProbability * 100).toFixed(2)),
    [t("revenue")]: Number(p.estimatedRevenueIndex.toFixed(2)),
  }));

  return (
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
              <Line type="monotone" dataKey={t("conversion")} stroke="#0B2A5B" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey={t("revenue")} stroke="#06B6D4" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t("recommendedPrice")}</div>
          <div className="mt-1 text-3xl font-semibold text-brand tabular-nums">
            {(pricing.recommendedPriceCents / 100).toLocaleString(undefined, {
              style: "currency",
              currency,
            })}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t("marginEstimate")}</div>
          <div className="mt-1 text-sm text-slate-700">{pricing.marginEstimate}</div>
        </div>
      </div>
    </div>
  );
}
