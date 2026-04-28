"use client";

import { useTranslations } from "next-intl";
import type { CountryScore } from "@/lib/simulation/schemas";

export function CountriesTab({ countries }: { countries: CountryScore[] }) {
  const t = useTranslations("results.country");
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-6 py-3 font-medium">#</th>
            <th className="text-left px-6 py-3 font-medium">{t("header")}</th>
            <th className="text-right px-6 py-3 font-medium">{t("demand")}</th>
            <th className="text-right px-6 py-3 font-medium">{t("cac")}</th>
            <th className="text-right px-6 py-3 font-medium">{t("competition")}</th>
            <th className="text-right px-6 py-3 font-medium">{t("score")}</th>
            <th className="text-left px-6 py-3 font-medium">{t("rationale")}</th>
          </tr>
        </thead>
        <tbody>
          {countries.map((c) => (
            <tr key={c.country} className="border-t border-slate-100">
              <td className="px-6 py-3 font-semibold text-brand">{c.rank}</td>
              <td className="px-6 py-3 font-medium">{c.country}</td>
              <td className="px-6 py-3 text-right tabular-nums">{c.demandScore.toFixed(0)}</td>
              <td className="px-6 py-3 text-right tabular-nums">${c.cacEstimateUsd.toFixed(0)}</td>
              <td className="px-6 py-3 text-right tabular-nums">{c.competitionScore.toFixed(0)}</td>
              <td className="px-6 py-3 text-right tabular-nums font-semibold">
                {c.finalScore.toFixed(0)}
              </td>
              <td className="px-6 py-3 text-slate-600 max-w-md">{c.rationale}</td>
            </tr>
          ))}
          {countries.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                {t("noData")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
