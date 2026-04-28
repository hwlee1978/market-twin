"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { clsx } from "clsx";
import type { CountryScore } from "@/lib/simulation/schemas";

type SortKey = "rank" | "demandScore" | "cacEstimateUsd" | "competitionScore" | "finalScore";
type SortDir = "asc" | "desc";

export function CountriesTab({ countries }: { countries: CountryScore[] }) {
  const t = useTranslations("results.country");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const out = [...countries];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const diff = av - bv;
      return sortDir === "asc" ? diff : -diff;
    });
    return out;
  }, [countries, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Sensible defaults: lower rank/CAC is better, higher score/demand is better.
      setSortDir(key === "rank" || key === "cacEstimateUsd" ? "asc" : "desc");
    }
  };

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align: "left" | "right" }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={clsx("px-6 py-3 font-medium", align === "right" ? "text-right" : "text-left")}>
        <button
          onClick={() => onSort(k)}
          className={clsx(
            "inline-flex items-center gap-1 hover:text-brand transition-colors",
            active && "text-brand",
          )}
        >
          <span>{label}</span>
          <Icon size={12} className={clsx(!active && "opacity-40")} />
        </button>
      </th>
    );
  };

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <SortHeader k="rank" label="#" align="left" />
            <th className="text-left px-6 py-3 font-medium">{t("header")}</th>
            <SortHeader k="demandScore" label={t("demand")} align="right" />
            <SortHeader k="cacEstimateUsd" label={t("cac")} align="right" />
            <SortHeader k="competitionScore" label={t("competition")} align="right" />
            <SortHeader k="finalScore" label={t("score")} align="right" />
            <th className="text-left px-6 py-3 font-medium">{t("rationale")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.country} className="border-t border-slate-100 hover:bg-slate-50">
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
          {sorted.length === 0 && (
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
