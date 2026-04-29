"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { COUNTRIES } from "@/lib/countries";
import { clsx } from "clsx";
import { AlertCircle, Check, Loader2, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChipRow } from "@/components/ui/CountryChip";
import { WIZARD_TEMPLATES } from "@/lib/wizard/templates";
import type { FormState } from "@/lib/wizard/types";

const STEPS = ["product", "pricing", "countries", "competitors", "review"] as const;
type StepKey = (typeof STEPS)[number];

const RECOMMENDED_PRESET = ["KR", "JP", "US"];

export function ProjectWizard({ locale }: { locale: string }) {
  const t = useTranslations();
  const tw = useTranslations("project.wizard");
  const currentLocale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [form, setForm] = useState<FormState>({
    name: "",
    productName: "",
    category: "saas",
    description: "",
    basePrice: "",
    currency: "USD",
    objective: "conversion",
    countries: [],
    competitorUrls: "",
    personaCount: 200,
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleCountry = (code: string) =>
    setForm((f) => ({
      ...f,
      countries: f.countries.includes(code)
        ? f.countries.filter((c) => c !== code)
        : [...f.countries, code],
    }));

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.labelKo.toLowerCase().includes(q) ||
        c.labelEn.toLowerCase().includes(q),
    );
  }, [countryQuery]);

  /** Patches every form field at once with the template's values. */
  const applyTemplate = (templateId: string) => {
    const tplDef = WIZARD_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!tplDef) return;
    setForm((f) => ({ ...f, ...tplDef.patch }));
  };

  const canAdvance = () => {
    switch (STEPS[step]) {
      case "product":
        return (
          form.name.trim() &&
          form.productName.trim() &&
          form.description.trim().length >= 10
        );
      case "pricing":
        return parseFloat(form.basePrice) > 0;
      case "countries":
        return form.countries.length > 0;
      case "competitors":
        return true;
      default:
        return true;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const competitorUrls = form.competitorUrls
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          productName: form.productName,
          category: form.category,
          description: form.description,
          basePriceCents: Math.round(parseFloat(form.basePrice) * 100),
          currency: form.currency,
          objective: form.objective,
          candidateCountries: form.countries,
          competitorUrls,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { projectId } = await res.json();

      const runRes = await fetch(`/api/simulations/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaCount: form.personaCount,
          locale: currentLocale,
        }),
      });
      if (!runRes.ok) throw new Error(await runRes.text());
      const { simulationId } = await runRes.json();

      router.push(`/projects/${projectId}/results?sim=${simulationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const stepKey: StepKey = STEPS[step];

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={tw("title")}
        subtitle={tw(`steps.${stepKey}.description`)}
      />

      <div className="mt-6 mb-8">
        <Stepper currentStep={step} />
      </div>

      <div className="card p-8 space-y-6">
        {stepKey === "product" && (
          <>
            <div className="rounded-lg bg-brand-50/60 border border-brand-100 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand mb-2.5">
                <Sparkles size={13} />
                {tw("templates.title")}
              </div>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                {tw("templates.description")}
              </p>
              <div className="flex flex-wrap gap-2">
                {WIZARD_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand transition-colors"
                  >
                    <span className="text-sm leading-none">{tpl.emoji}</span>
                    {tw(`templates.items.${tpl.i18nKey}` as "templates.items.kbeauty")}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={tw("fields.projectName")}
              hint={tw("hints.projectName")}
            >
              <input
                className="input"
                placeholder={tw("placeholders.projectName")}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </Field>
            <Field
              label={tw("fields.productName")}
              hint={tw("hints.productName")}
            >
              <input
                className="input"
                placeholder={tw("placeholders.productName")}
                value={form.productName}
                onChange={(e) => update("productName", e.target.value)}
              />
            </Field>
            <Field label={tw("fields.category")}>
              <select
                className="input"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {(["beauty", "fashion", "food", "health", "electronics", "home", "saas", "other"] as const).map((c) => (
                  <option key={c} value={c}>
                    {tw(`categories.${c}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={tw("fields.description")}
              hint={tw("hints.description")}
            >
              <textarea
                className="input min-h-[140px] leading-relaxed"
                placeholder={tw("placeholders.description")}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
              <CharCounter value={form.description} min={10} />
            </Field>
          </>
        )}

        {stepKey === "pricing" && (
          <>
            <Field
              label={tw("fields.basePrice")}
              hint={tw("hints.basePrice")}
            >
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="input flex-1"
                  value={form.basePrice}
                  onChange={(e) => update("basePrice", e.target.value)}
                />
                <select
                  className="input w-28"
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  <option>USD</option>
                  <option>KRW</option>
                  <option>EUR</option>
                  <option>JPY</option>
                </select>
              </div>
            </Field>
            <Field
              label={tw("fields.objective")}
              hint={tw("hints.objective")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(["awareness", "conversion", "retention", "expansion"] as const).map((o) => {
                  const active = form.objective === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => update("objective", o)}
                      className={clsx(
                        "rounded-lg border px-4 py-3 text-sm text-left transition-colors",
                        active
                          ? "border-brand bg-brand-50 text-brand"
                          : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      <div className="font-medium">{tw(`objective.${o}`)}</div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {tw(`objectiveHint.${o}`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}

        {stepKey === "countries" && (
          <>
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <label className="label">{tw("fields.countries")}</label>
                <p className="text-xs text-slate-500">{tw("hints.countries")}</p>
              </div>
              <button
                type="button"
                onClick={() => update("countries", RECOMMENDED_PRESET)}
                className="text-xs text-brand hover:underline whitespace-nowrap"
              >
                {tw("countriesPreset")}
              </button>
            </div>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder={tw("countriesSearchPlaceholder")}
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredCountries.map((c) => {
                const selected = form.countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={clsx(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      selected
                        ? "border-brand bg-brand-50 text-brand"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="truncate">
                      {locale === "ko" ? c.labelKo : c.labelEn}
                    </span>
                    {selected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-slate-500 pt-1">
              {tw("countriesCount", { n: form.countries.length })}
            </div>
          </>
        )}

        {stepKey === "competitors" && (
          <Field
            label={tw("fields.competitorUrls")}
            hint={tw("hints.competitorUrls")}
            optional
          >
            <textarea
              className="input min-h-[140px] font-mono text-xs leading-relaxed"
              placeholder={"https://competitor1.com\nhttps://competitor2.com"}
              value={form.competitorUrls}
              onChange={(e) => update("competitorUrls", e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-500">{tw("competitorUrlsFormat")}</p>
          </Field>
        )}

        {stepKey === "review" && (
          <div className="space-y-5">
            <ReviewRow label={tw("fields.projectName")} value={form.name} />
            <ReviewRow label={tw("fields.productName")} value={form.productName} />
            <ReviewRow
              label={tw("fields.category")}
              value={tw(`categories.${form.category as "saas"}`)}
            />
            <ReviewRow
              label={tw("fields.basePrice")}
              value={`${form.basePrice} ${form.currency}`}
            />
            <ReviewRow
              label={tw("fields.objective")}
              value={tw(`objective.${form.objective}`)}
            />
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0">
              <div className="text-sm text-slate-500">{tw("fields.countries")}</div>
              <div className="text-right">
                {form.countries.length > 0 ? (
                  <CountryChipRow codes={form.countries} size="sm" />
                ) : (
                  <span className="text-sm text-slate-900 font-medium">—</span>
                )}
              </div>
            </div>

            <Field label={tw("personaCount.label")} hint={tw("personaCount.hint")}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[50, 200, 500, 1000].map((n) => {
                  const active = form.personaCount === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => update("personaCount", n)}
                      className={clsx(
                        "rounded-lg border px-3 py-2.5 text-sm text-left transition-colors",
                        active
                          ? "border-brand bg-brand-50 text-brand"
                          : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      <div className="font-mono font-semibold tabular-nums">{n}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {tw(`personaCount.tier.${n}` as "personaCount.tier.50")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-risk-soft bg-risk-soft/40 px-3 py-2 text-sm text-risk">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="btn-ghost disabled:opacity-40"
        >
          {t("common.back")}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="btn-primary"
          >
            {t("common.next")}
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !canAdvance()}
            className="btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              tw("runCta")
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ currentStep }: { currentStep: number }) {
  const tw = useTranslations("project.wizard");
  return (
    <ol className="flex items-center gap-1.5 text-xs flex-wrap">
      {STEPS.map((key, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        return (
          <li key={key} className="flex items-center gap-1.5">
            <span
              className={clsx(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-brand text-white"
                    : "bg-slate-200 text-slate-500",
              )}
            >
              {done ? <Check size={12} /> : i + 1}
            </span>
            <span
              className={clsx(
                "whitespace-nowrap",
                active
                  ? "text-brand font-semibold"
                  : done
                    ? "text-slate-700"
                    : "text-slate-400",
              )}
            >
              {tw(`steps.${key}.title`)}
            </span>
            {i < STEPS.length - 1 && (
              <span className="w-5 h-px bg-slate-200 mx-0.5" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label flex items-center gap-2">
        {label}
        {optional && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-normal">
            optional
          </span>
        )}
      </label>
      {hint && <p className="-mt-1 mb-2 text-xs text-slate-500 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function CharCounter({ value, min }: { value: string; min: number }) {
  const len = value.trim().length;
  const enough = len >= min;
  return (
    <p
      className={clsx(
        "mt-1.5 text-xs tabular-nums",
        enough ? "text-slate-500" : "text-slate-400",
      )}
    >
      {enough ? `${len} characters` : `${len} / ${min} minimum`}
    </p>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 font-medium text-right max-w-[60%] break-keep">
        {value || "—"}
      </div>
    </div>
  );
}
