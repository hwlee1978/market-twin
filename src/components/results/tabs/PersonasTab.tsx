"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Quote, Search, X } from "lucide-react";
import { clsx } from "clsx";
import type { Persona } from "@/lib/simulation/schemas";
import { getCountryLabel } from "@/lib/countries";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { filterLocaleNative } from "@/lib/simulation/locale-filter";

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
  // Strip locale-leaked entries from each persona's free-text array fields so
  // mixed-language items don't surface in the cards or the search haystack.
  const cleanPersonas = useMemo(
    () =>
      personas.map((p) => ({
        ...p,
        objections: filterLocaleNative(p.objections, locale),
        trustFactors: filterLocaleNative(p.trustFactors, locale),
        interests: filterLocaleNative(p.interests, locale),
      })),
    [personas, locale],
  );
  const countries = useMemo(
    () => Array.from(new Set(cleanPersonas.map((p) => p.country))).sort(),
    [cleanPersonas],
  );
  const [country, setCountry] = useState<string>("all");
  const [intent, setIntent] = useState<"all" | "high" | "low">("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [query, setQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cleanPersonas.filter((p) => {
      if (country !== "all" && p.country !== country) return false;
      if (intent === "high" && p.purchaseIntent < 70) return false;
      if (intent === "low" && p.purchaseIntent >= 35) return false;
      if (q) {
        const haystack = [
          p.profession,
          p.purchaseStyle,
          p.incomeBand,
          p.voice,
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
  }, [cleanPersonas, country, intent, query]);

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
      {/* Filter row: search spans full width on mobile, selects share a 3-up
          grid on the smallest screens, then collapse into the inline row at sm+
          where there's room for everything side-by-side. */}
      <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
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
        <div className="grid grid-cols-3 gap-2 sm:contents">
          <select
            className="input w-full sm:w-44"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="all">{t("showing", { count: personas.length })}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {getCountryLabel(c, locale)}
              </option>
            ))}
          </select>
          <select
            className="input w-full sm:w-44"
            value={intent}
            onChange={(e) => setIntent(e.target.value as "all" | "high" | "low")}
          >
            <option value="all">{t("intent.all")}</option>
            <option value="high">{t("intent.high")}</option>
            <option value="low">{t("intent.low")}</option>
          </select>
          <select
            className="input w-full sm:w-44"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="default">{t("sort.default")}</option>
            <option value="intentDesc">{t("sort.intentDesc")}</option>
            <option value="intentAsc">{t("sort.intentAsc")}</option>
          </select>
        </div>
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
                      aria-expanded={expanded}
                      className={clsx(
                        "card p-5 text-left transition-all hover:shadow-md hover:border-brand-100",
                        expanded && "ring-2 ring-brand-100 shadow-md bg-brand-50/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={clsx(
                              "text-sm font-semibold leading-snug",
                              expanded ? "" : "line-clamp-2",
                            )}
                          >
                            {p.profession}
                          </div>
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
                      {p.voice && (
                        <div className="mt-3 rounded-md bg-brand-50/40 border-l-2 border-brand-200 px-3 py-2 flex gap-2 items-start">
                          <Quote
                            size={11}
                            className="text-brand-300 shrink-0 mt-1"
                          />
                          {/* line-clamp-3 keeps card heights uniform when an
                              over-eager voice slips past the prompt's length
                              cap. Expanded view drops the clamp so users can
                              still read the full quote. */}
                          <p
                            className={clsx(
                              "text-xs italic text-slate-700 leading-relaxed break-keep",
                              !expanded && "line-clamp-3",
                            )}
                          >
                            {p.voice}
                          </p>
                        </div>
                      )}
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
                            <div>
                              <span className="text-slate-400">
                                {t("labels.priceSensitivity")}:
                              </span>{" "}
                              {t(`sensitivity.${p.priceSensitivity}`)}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        <span>{expanded ? t("clickToCollapse") : t("clickToExpand")}</span>
                        <ChevronDown
                          size={11}
                          className={clsx(
                            "transition-transform duration-200",
                            expanded && "rotate-180",
                          )}
                        />
                      </div>
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
