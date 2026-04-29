"use client";

import { Fragment, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { CountryScore, Persona } from "@/lib/simulation/schemas";
import { getCountryLabel } from "@/lib/countries";
import type { RegulatoryMeta } from "./OverviewTab";

type SortKey = "rank" | "demandScore" | "cacEstimateUsd" | "competitionScore" | "finalScore";
type SortDir = "asc" | "desc";

interface Props {
  countries: CountryScore[];
  /** Personas + regulatory + sources are passed through so each row can drill in. */
  personas?: Persona[];
  regulatory?: RegulatoryMeta;
  sources?: string[];
}

export function CountriesTab({ countries, personas = [], regulatory, sources = [] }: Props) {
  const t = useTranslations("results.country");
  const tDrill = useTranslations("results.country.drill");
  const locale = useLocale();
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<string | null>(null);

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
            <th className="w-8 px-3 py-3" />
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
          {sorted.map((c) => {
            const isOpen = expanded === c.country;
            return (
              <Fragment key={c.country}>
                <tr
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : c.country)}
                >
                  <td className="px-3 py-3 text-slate-400">
                    <ChevronRight
                      size={14}
                      className={clsx("transition-transform", isOpen && "rotate-90")}
                    />
                  </td>
                  <td className="px-6 py-3 font-semibold text-brand">{c.rank}</td>
                  <td className="px-6 py-3 font-medium">{getCountryLabel(c.country, locale)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.demandScore.toFixed(0)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">${c.cacEstimateUsd.toFixed(0)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.competitionScore.toFixed(0)}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold">
                    {c.finalScore.toFixed(0)}
                  </td>
                  <td className="px-6 py-3 text-slate-600 max-w-md truncate">{c.rationale}</td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-slate-100 bg-slate-50/50">
                    <td colSpan={8} className="px-12 py-5">
                      <CountryDrilldown
                        country={c}
                        personas={personas}
                        regulatory={regulatory}
                        sources={sources}
                        t={tDrill}
                        locale={locale}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                {t("noData")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CountryDrilldown({
  country,
  personas,
  regulatory,
  sources,
  t,
  locale,
}: {
  country: CountryScore;
  personas: Persona[];
  regulatory?: RegulatoryMeta;
  sources: string[];
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const inCountry = personas.filter((p) => p.country === country.country);
  const avgIntent =
    inCountry.length > 0
      ? Math.round(inCountry.reduce((s, p) => s + p.purchaseIntent, 0) / inCountry.length)
      : null;
  const highIntent = inCountry.filter((p) => p.purchaseIntent >= 70).length;
  const lowIntent = inCountry.filter((p) => p.purchaseIntent < 35).length;

  // Aggregate the most common objections — strong signal for "why might this country churn?"
  const objectionCounts = new Map<string, number>();
  for (const p of inCountry) {
    for (const o of p.objections ?? []) {
      const key = o.trim();
      if (!key) continue;
      objectionCounts.set(key, (objectionCounts.get(key) ?? 0) + 1);
    }
  }
  const topObjections = Array.from(objectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const warning = regulatory?.warnings.find((w) => w.country === country.country);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            {t("rationaleFull")}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {country.rationale}
          </p>
        </div>

        {warning && warning.status !== "allowed" && (
          <div
            className={clsx(
              "rounded-lg p-3 text-sm border-l-4",
              warning.status === "banned"
                ? "border-l-risk bg-risk-soft/40 text-slate-800"
                : "border-l-warn bg-warn-soft/40 text-slate-800",
            )}
          >
            <div className="text-[10px] uppercase tracking-wide font-semibold mb-1">
              {warning.status === "banned" ? t("regBanned") : t("regRestricted")}
            </div>
            <div>{warning.reason}</div>
            {warning.source && (
              <div className="text-xs text-slate-500 mt-1">{warning.source}</div>
            )}
          </div>
        )}

        {topObjections.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              {t("topObjections")}
            </div>
            <ul className="space-y-1.5 text-sm">
              {topObjections.map(([text, n]) => (
                <li key={text} className="flex items-start gap-2">
                  <span className="badge bg-slate-100 text-slate-600 shrink-0 tabular-nums">
                    {n}
                  </span>
                  <span className="text-slate-700">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
            {t("personaSummary")}
          </div>
          {inCountry.length === 0 ? (
            <p className="text-xs text-slate-500">{t("noPersonas")}</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              <li className="flex justify-between">
                <span className="text-slate-500">{t("count")}</span>
                <span className="text-slate-900">{inCountry.length}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{t("avgIntent")}</span>
                <span className="text-slate-900">{avgIntent}/100</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{t("highIntent")}</span>
                <span className="text-success">{highIntent}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{t("lowIntent")}</span>
                <span className="text-risk">{lowIntent}</span>
              </li>
            </ul>
          )}
        </div>

        {sources.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              {t("anchoredOn")}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{sources.join(" · ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
