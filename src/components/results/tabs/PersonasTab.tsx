"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Persona } from "@/lib/simulation/schemas";
import { clsx } from "clsx";

/** Map common LLM-output gender strings to canonical i18n keys. */
function genderKey(g: string): "male" | "female" | "other" | "unknown" {
  const s = g.toLowerCase().trim();
  if (s.startsWith("m") || s.includes("남")) return "male";
  if (s.startsWith("f") || s.includes("여")) return "female";
  if (!s || s === "unknown" || s === "미상" || s === "n/a") return "unknown";
  return "other";
}

export function PersonasTab({ personas }: { personas: Persona[] }) {
  const t = useTranslations("results.persona");
  const countries = useMemo(
    () => Array.from(new Set(personas.map((p) => p.country))).sort(),
    [personas],
  );
  const [country, setCountry] = useState<string>("all");
  const [intent, setIntent] = useState<"all" | "high" | "low">("all");

  const filtered = personas.filter((p) => {
    if (country !== "all" && p.country !== country) return false;
    if (intent === "high" && p.purchaseIntent < 70) return false;
    if (intent === "low" && p.purchaseIntent >= 35) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select className="input w-48" value={country} onChange={(e) => setCountry(e.target.value)}>
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
        <span className="self-center text-sm text-slate-500">
          {t("showing", { count: filtered.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.slice(0, 60).map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{p.profession}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {p.country} • {p.ageRange} • {t(`gender.${genderKey(p.gender)}`)}
                </div>
              </div>
              <span
                className={clsx(
                  "badge",
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
                  {p.objections.slice(0, 2).join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {filtered.length > 60 && (
        <p className="text-center text-xs text-slate-500">
          {t("showingFirst", { shown: 60, total: filtered.length })}
        </p>
      )}
    </div>
  );
}
