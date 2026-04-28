"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { COUNTRIES } from "@/lib/countries";
import { clsx } from "clsx";
import { Check } from "lucide-react";

interface FormState {
  name: string;
  productName: string;
  category: string;
  description: string;
  basePrice: string;
  currency: string;
  objective: "awareness" | "conversion" | "retention" | "expansion";
  countries: string[];
  competitorUrls: string;
  personaCount: number;
}

const STEP_KEYS = ["step1", "step2", "step3", "step4", "step5", "step6"] as const;

export function ProjectWizard({ locale }: { locale: string }) {
  const t = useTranslations();
  const currentLocale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const canAdvance = () => {
    switch (step) {
      case 0:
        return form.name.trim() && form.productName.trim() && form.description.trim().length >= 10;
      case 1:
        return parseFloat(form.basePrice) > 0;
      case 2:
        return true;
      case 3:
        return form.countries.length > 0;
      case 4:
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
        body: JSON.stringify({ personaCount: form.personaCount, locale: currentLocale }),
      });
      if (!runRes.ok) throw new Error(await runRes.text());
      const { simulationId } = await runRes.json();

      router.push(`/projects/${projectId}/results?sim=${simulationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">{t("project.wizard.title")}</h1>

      <Stepper currentStep={step} />

      <div className="card p-8">
        {step === 0 && (
          <div className="space-y-4">
            <Field label={t("project.wizard.fields.projectName")}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </Field>
            <Field label={t("project.wizard.fields.productName")}>
              <input
                className="input"
                value={form.productName}
                onChange={(e) => update("productName", e.target.value)}
              />
            </Field>
            <Field label={t("project.wizard.fields.category")}>
              <select
                className="input"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {(["beauty", "fashion", "food", "health", "electronics", "home", "saas", "other"] as const).map(
                  (c) => (
                    <option key={c} value={c}>
                      {t(`project.wizard.categories.${c}`)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label={t("project.wizard.fields.description")}>
              <textarea
                className="input min-h-[120px]"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label={t("project.wizard.fields.basePrice")}>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
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
            <Field label={t("project.wizard.fields.objective")}>
              <select
                className="input"
                value={form.objective}
                onChange={(e) =>
                  update("objective", e.target.value as FormState["objective"])
                }
              >
                {(["awareness", "conversion", "retention", "expansion"] as const).map((o) => (
                  <option key={o} value={o}>
                    {t(`project.wizard.objective.${o}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label={t("project.wizard.fields.assets")}>
              <p className="text-sm text-slate-500">
                {/* v0.1: file uploads deferred — assets are described in product description for now */}
                Asset upload will be enabled in the next release. For now your description is used.
              </p>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <label className="label">{t("project.wizard.fields.countries")}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COUNTRIES.map((c) => {
                const selected = form.countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={clsx(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                      selected
                        ? "border-brand bg-brand-50 text-brand"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span>{locale === "ko" ? c.labelKo : c.labelEn}</span>
                    {selected && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <Field label={t("project.wizard.fields.competitorUrls")}>
            <textarea
              className="input min-h-[120px] font-mono text-xs"
              placeholder="https://..."
              value={form.competitorUrls}
              onChange={(e) => update("competitorUrls", e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">One URL per line</p>
          </Field>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <ReviewRow label={t("project.wizard.fields.projectName")} value={form.name} />
            <ReviewRow label={t("project.wizard.fields.productName")} value={form.productName} />
            <ReviewRow label={t("project.wizard.fields.category")} value={t(`project.wizard.categories.${form.category as "saas"}`)} />
            <ReviewRow
              label={t("project.wizard.fields.basePrice")}
              value={`${form.basePrice} ${form.currency}`}
            />
            <ReviewRow
              label={t("project.wizard.fields.objective")}
              value={t(`project.wizard.objective.${form.objective}`)}
            />
            <ReviewRow
              label={t("project.wizard.fields.countries")}
              value={form.countries.join(", ")}
            />
            <Field label="Persona count">
              <select
                className="input w-40"
                value={form.personaCount}
                onChange={(e) => update("personaCount", Number(e.target.value))}
              >
                <option value={50}>50 (fast)</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
              </select>
            </Field>
            {error && <div className="text-sm text-risk">{error}</div>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="btn-ghost"
        >
          {t("common.back")}
        </button>
        {step < STEP_KEYS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="btn-primary"
          >
            {t("common.next")}
          </button>
        ) : (
          <button onClick={submit} disabled={submitting} className="btn-primary">
            {submitting ? t("common.loading") : t("project.wizard.runCta")}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ currentStep }: { currentStep: number }) {
  const t = useTranslations("project.wizard");
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEP_KEYS.map((key, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        return (
          <li key={key} className="flex items-center gap-2">
            <span
              className={clsx(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                done ? "bg-success text-white" : active ? "bg-brand text-white" : "bg-slate-200 text-slate-500",
              )}
            >
              {done ? <Check size={12} /> : i + 1}
            </span>
            <span className={clsx(active ? "text-brand font-medium" : "text-slate-500")}>
              {t(key)}
            </span>
            {i < STEP_KEYS.length - 1 && <span className="w-6 h-px bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 pb-2 last:border-b-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 font-medium text-right max-w-[60%]">{value || "—"}</div>
    </div>
  );
}
