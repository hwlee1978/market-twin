"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { clsx } from "clsx";
import type { Persona } from "@/lib/simulation/schemas";
import { getCountryLabel } from "@/lib/countries";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

/** Map common LLM-output gender strings to canonical i18n keys. */
function genderKey(g: string): "male" | "female" | "other" | "unknown" {
  const s = g.toLowerCase().trim();
  if (s.startsWith("m") || s.includes("남")) return "male";
  if (s.startsWith("f") || s.includes("여")) return "female";
  if (!s || s === "unknown" || s === "미상" || s === "n/a") return "unknown";
  return "other";
}

type SortKey = "default" | "intentDesc" | "intentAsc";

export function PersonasTab({
  personas,
  sources = [],
}: {
  personas: Persona[];
  sources?: string[];
}) {
  const t = useTranslations("results.persona");
  const locale = useLocale();
  const countries = useMemo(
    () => Array.from(new Set(personas.map((p) => p.country))).sort(),
    [personas],
  );
  const [country, setCountry] = useState<string>("all");
  const [intent, setIntent] = useState<"all" | "high" | "low">("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [query, setQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personas.filter((p) => {
      if (country !== "all" && p.country !== country) return false;
      if (intent === "high" && p.purchaseIntent < 70) return false;
      if (intent === "low" && p.purchaseIntent >= 35) return false;
      if (q) {
        const haystack = [
          p.profession,
          p.purchaseStyle,
          p.incomeBand,
          ...(p.interests ?? []),
          ...(p.objections ?? []),
          ...(p.trustFactors ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [personas, country, intent, query]);

  /** Group filtered personas by country, with the user-chosen sort applied within each group. */
  const grouped = useMemo(() => {
    const map = new Map<string, Persona[]>();
    for (const p of filtered) {
      const list = map.get(p.country) ?? [];
      list.push(p);
      map.set(p.country, list);
    }
    if (sort !== "default") {
      const sortFn =
        sort === "intentDesc"
          ? (a: Persona, b: Persona) => b.purchaseIntent - a.purchaseIntent
          : (a: Persona, b: Persona) => a.purchaseIntent - b.purchaseIntent;
      for (const list of map.values()) list.sort(sortFn);
    }
    // Sort groups by localized country name so the page reads naturally per locale.
    return Array.from(map.entries()).sort(([a], [b]) =>
      getCountryLabel(a, locale).localeCompare(getCountryLabel(b, locale), locale),
    );
  }, [filtered, sort, locale]);

  // Collapse expanded card whenever filters change.
  useEffect(() => {
    setExpandedId(null);
  }, [country, intent, sort, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              aria-label="clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select className="input w-44" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="all">{t("showing", { count: personas.length })}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {getCountryLabel(c, locale)}
            </option>
          ))}
        </select>
        <select
          className="input w-44"
          value={intent}
          onChange={(e) => setIntent(e.target.value as "all" | "high" | "low")}
        >
          <option value="all">{t("intent.all")}</option>
          <option value="high">{t("intent.high")}</option>
          <option value="low">{t("intent.low")}</option>
        </select>
        <select className="input w-44" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="default">{t("sort.default")}</option>
          <option value="intentDesc">{t("sort.intentDesc")}</option>
          <option value="intentAsc">{t("sort.intentAsc")}</option>
        </select>
        <span className="text-sm text-slate-500">
          {t("showing", { count: filtered.length })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-medium">
          {t("intentLegend")}:
          <HelpTooltip text={t("help.intentLegend")} />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-success" />
          {t("intentHigh")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-warn" />
          {t("intentMedium")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-risk" />
          {t("intentLow")}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">{t("noResults")}</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([code, group]) => {
            const avg = Math.round(
              group.reduce((s, p) => s + p.purchaseIntent, 0) / group.length,
            );
            const high = group.filter((p) => p.purchaseIntent >= 70).length;
            const low = group.filter((p) => p.purchaseIntent < 35).length;
            return (
            <section key={code} className="space-y-3">
              <div className="border-b border-slate-200 pb-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {getCountryLabel(code, locale)}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {t("showing", { count: group.length })}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 tabular-nums">
                  <span>
                    {t("groupAvgIntent")}{" "}
                    <span className="text-slate-700 font-medium">{avg}/100</span>
                  </span>
                  <span>
                    {t("groupHigh")} <span className="text-success font-medium">{high}</span>
                  </span>
                  <span>
                    {t("groupLow")} <span className="text-risk font-medium">{low}</span>
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.map((p) => {
                  const expanded = expandedId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setExpandedId(expanded ? null : (p.id ?? null))}
                      className={clsx(
                        "card p-5 text-left transition-all hover:shadow-md hover:border-brand-100",
                        expanded && "ring-2 ring-brand-100 shadow-md",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{p.profession}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {p.ageRange} · {t(`gender.${genderKey(p.gender)}`)}
                          </div>
                        </div>
                        <span
                          className={clsx(
                            "badge shrink-0",
                            p.purchaseIntent >= 70
                              ? "bg-success-soft text-success"
                              : p.purchaseIntent >= 35
                                ? "bg-warn-soft text-warn"
                                : "bg-risk-soft text-risk",
                          )}
                        >
                          {p.purchaseIntent}/100
                        </span>
                      </div>
                      <div className="mt-4 text-xs text-slate-600 space-y-2 leading-relaxed">
                        <div>
                          <span className="text-slate-400">{t("labels.income")}:</span> {p.incomeBand}
                        </div>
                        <div>
                          <span className="text-slate-400">{t("labels.style")}:</span> {p.purchaseStyle}
                        </div>
                        {p.objections?.length > 0 && (
                          <div>
                            <span className="text-slate-400">{t("labels.objections")}:</span>{" "}
                            {expanded ? p.objections.join(", ") : p.objections.slice(0, 2).join(", ")}
                            {!expanded && p.objections.length > 2 && (
                              <span className="text-slate-400"> … +{p.objections.length - 2}</span>
                            )}
                          </div>
                        )}
                        {expanded && (
                          <>
                            {p.interests?.length > 0 && (
                              <div>
                                <span className="text-slate-400">{t("labels.interests")}:</span>{" "}
                                {p.interests.join(", ")}
                              </div>
                            )}
                            {p.trustFactors?.length > 0 && (
                              <div>
                                <span className="text-slate-400">{t("labels.trustFactors")}:</span>{" "}
                                {p.trustFactors.join(", ")}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {!expanded && (
                        <div className="mt-4 text-[10px] text-slate-400 uppercase tracking-wider">
                          {t("clickToExpand")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
            );
          })}
          {sources.length > 0 && (
            <div className="card bg-slate-50 border-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {t("anchoredOn")}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {sources.join(" · ")}
              </p>
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                {t("anchoredHint")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
