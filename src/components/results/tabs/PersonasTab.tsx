"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Persona } from "@/lib/simulation/schemas";
import { clsx } from "clsx";
import { Search, X } from "lucide-react";

/** Map common LLM-output gender strings to canonical i18n keys. */
function genderKey(g: string): "male" | "female" | "other" | "unknown" {
  const s = g.toLowerCase().trim();
  if (s.startsWith("m") || s.includes("남")) return "male";
  if (s.startsWith("f") || s.includes("여")) return "female";
  if (!s || s === "unknown" || s === "미상" || s === "n/a") return "unknown";
  return "other";
}

type SortKey = "default" | "intentDesc" | "intentAsc";

const PAGE_SIZE = 30;

export function PersonasTab({ personas }: { personas: Persona[] }) {
  const t = useTranslations("results.persona");
  const countries = useMemo(
    () => Array.from(new Set(personas.map((p) => p.country))).sort(),
    [personas],
  );
  const [country, setCountry] = useState<string>("all");
  const [intent, setIntent] = useState<"all" | "high" | "low">("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [query, setQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = personas.filter((p) => {
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

    if (sort === "intentDesc") {
      out = [...out].sort((a, b) => b.purchaseIntent - a.purchaseIntent);
    } else if (sort === "intentAsc") {
      out = [...out].sort((a, b) => a.purchaseIntent - b.purchaseIntent);
    }
    return out;
  }, [personas, country, intent, sort, query]);

  // Reset to page 1 + collapse whenever filters change.
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [country, intent, sort, query]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

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
              {c}
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

      {filtered.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">{t("noResults")}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setExpandedId(expanded ? null : (p.id ?? null))}
                className={clsx(
                  "card p-4 text-left transition-all hover:shadow-md hover:border-brand-100",
                  expanded && "ring-2 ring-brand-100 shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.profession}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.country} • {p.ageRange} • {t(`gender.${genderKey(p.gender)}`)}
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
                <div className="mt-3 text-xs text-slate-600 space-y-1.5">
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
                  <div className="mt-3 text-[10px] text-slate-400 uppercase tracking-wide">
                    {t("clickToExpand")}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <button onClick={() => setPage((p) => p + 1)} className="btn-secondary">
            {t("showingFirst", { shown: visible.length, total: filtered.length })} →
          </button>
        </div>
      )}
      {!hasMore && filtered.length > PAGE_SIZE && (
        <p className="text-center text-xs text-slate-500">
          {t("showing", { count: filtered.length })}
        </p>
      )}
    </div>
  );
}
