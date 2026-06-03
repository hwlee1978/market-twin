"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { COUNTRIES } from "@/lib/countries";
import { clsx } from "clsx";
import { AlertCircle, Check, Info, Loader2, Search, Sparkles, Upload, X as XIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChipRow } from "@/components/ui/CountryChip";
import { WIZARD_TEMPLATES } from "@/lib/wizard/templates";
import type { FormState } from "@/lib/wizard/types";
import { capture } from "@/lib/analytics/posthog";
import { detectEchoBias, summarizeEchoBias } from "@/lib/validation/echo-bias-detector";
import { DescriptionStrengthHint } from "@/components/DescriptionStrengthHint";

const STEPS = ["product", "pricing", "countries", "competitors", "assets", "review"] as const;

// Per-currency "one too many zeros" ceiling. Calibrated so a luxury
// product ($1K USD ≈ 1.4M KRW ≈ 150K JPY) still fits with comfortable
// headroom, but obvious typos (one extra zero) get caught. Values are
// rounded to a clean order-of-magnitude — this is a sanity check, not
// a business rule, so precision isn't important.
const PRICE_CEILINGS: Record<string, number> = {
  USD: 100_000,
  EUR: 100_000,
  GBP: 100_000,
  CAD: 100_000,
  AUD: 100_000,
  KRW: 50_000_000, // ~$37K equivalent
  JPY: 10_000_000, // ~$67K
  VND: 1_000_000_000, // ~$40K
  THB: 3_000_000, // ~$85K
  IDR: 1_000_000_000, // ~$65K
  INR: 5_000_000, // ~$60K
  PHP: 5_000_000, // ~$90K
  TWD: 3_000_000, // ~$95K
  MXN: 1_500_000, // ~$80K
  BRL: 500_000, // ~$95K
};
function priceCeilingFor(currency: string): number {
  return PRICE_CEILINGS[currency.toUpperCase()] ?? 100_000;
}
type StepKey = (typeof STEPS)[number];

// Default candidate presets for the empty-state. Export-focused (no KR/US
// in the default set) but the wizard now lets the user add their origin
// country as a candidate too — useful for domestic + export comparison.
const RECOMMENDED_PRESET = ["US", "JP", "ID"];

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
    // Default origin — KR for the Korean locale (K-product export
    // positioning) and US for the English locale (global "any-origin →
    // any-target" framing). The simulator handles all 24 origin
    // countries equally; this default just biases the empty-state
    // toward each locale's primary user base. User can change to any
    // of the 24 supported origins regardless of locale.
    originatingCountry: locale === "ko" ? "KR" : "US",
    // Pre-select the export-focused preset (foreign markets only — origin
    // is tracked separately above). User can change either independently.
    // Filter out the default origin so the preset never overlaps with
    // it (e.g., US-origin English default shouldn't include US in
    // candidates).
    countries: RECOMMENDED_PRESET.filter(
      (c) => c !== (locale === "ko" ? "KR" : "US"),
    ).concat(
      // English default fills the dropped slot with GB so the preset
      // stays at 3 candidates and showcases multi-region targeting.
      locale === "ko" ? [] : ["GB"],
    ),
    competitorNames: "",
    competitorUrls: "",
    assetDescriptions: "",
    assetUrls: "",
    personaCount: 200,
    // 2026-05-20: Default tier is hypothesis (3 sims × 200 personas × multi-LLM).
    // Recommended workflow — run hypothesis first to check Top-1 dominance
    // vs Top-2 cluster, then commit to decision-tier only if narrative depth
    // is needed. ~10× cost saving vs starting at decision tier directly.
    tier: "hypothesis",
    notifyEmail: "",
    founderBackground: "",
    channelPriority: "",
    kolRelationships: "",
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Uploaded creative-asset images. Each item is the result of a POST
  // to /api/upload/creative-asset (or an in-flight upload). At submit
  // time, the successfully-uploaded URLs are merged with any URLs the
  // user pasted into the manual textarea below the uploader.
  type UploadedItem = {
    /** Local id for React keys + removal. */
    id: string;
    /** Original filename for display. */
    name: string;
    /** Storage path returned by the API (used for delete on remove). */
    path?: string;
    /** Public URL — only present once upload succeeds. */
    url?: string;
    /** Preview data-URL for thumbnails (rendered before upload finishes). */
    previewDataUrl?: string;
    status: "uploading" | "done" | "error";
    error?: string;
  };
  const [uploads, setUploads] = useState<UploadedItem[]>([]);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    // Push placeholders first so the UI shows progress immediately.
    const placeholders: UploadedItem[] = list.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      status: "uploading",
    }));
    setUploads((prev) => [...prev, ...placeholders]);
    // Generate local preview thumbnails so the user sees the image
    // before the network round-trip completes. Updates state inline.
    list.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") return;
        setUploads((prev) =>
          prev.map((u) =>
            u.id === placeholders[i].id ? { ...u, previewDataUrl: result } : u,
          ),
        );
      };
      reader.readAsDataURL(f);
    });
    // Upload each file in parallel; update state per-file as each
    // resolves. Server enforces the 4 MB / image-type limits.
    await Promise.all(
      list.map(async (file, i) => {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/upload/creative-asset", {
            method: "POST",
            body: fd,
          });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error ?? "upload failed");
          }
          setUploads((prev) =>
            prev.map((u) =>
              u.id === placeholders[i].id
                ? { ...u, status: "done", url: json.url, path: json.path }
                : u,
            ),
          );
        } catch (err) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === placeholders[i].id
                ? {
                    ...u,
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                  }
                : u,
            ),
          );
        }
      }),
    );
  };

  const removeUpload = (id: string) => {
    // Local-only removal — the storage object lingers until project
    // deletion or a future cleanup pass. Trade-off: avoids needing
    // another API round-trip just to keep the UI snappy. Not
    // user-visible since the URL never reaches the project record
    // unless they submit.
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

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

  // Returns the human-readable items the user needs to address before
  // advancing the current step. Empty array = step is valid.
  // Surfacing what's missing (rather than just disabling Next) is what
  // turns a confused-grey-button moment into a self-correcting one.
  const isKo = locale === "ko";
  const validationHints = (): string[] => {
    switch (STEPS[step]) {
      case "product": {
        const errors: string[] = [];
        if (!form.name.trim()) errors.push(tw("validation.projectName"));
        if (!form.productName.trim()) errors.push(tw("validation.productName"));
        // Soft cap so the project / product name doesn't blow past UI
        // truncation widths in cards / PDF cover. 200 is generous enough
        // that legitimate brand+product strings fit ("Beauty of Joseon
        // Relief Sun: Rice + Probiotics" is 47 chars).
        if (form.name.trim().length > 200) {
          errors.push(isKo ? "프로젝트 이름은 200자 이내로 작성하세요." : "Project name must be 200 chars or fewer.");
        }
        if (form.productName.trim().length > 200) {
          errors.push(isKo ? "제품 이름은 200자 이내로 작성하세요." : "Product name must be 200 chars or fewer.");
        }
        if (form.description.trim().length < 10) errors.push(tw("validation.description"));
        if (form.description.trim().length > 4000) {
          // Description gets quoted into the synthesis prompt; >4000 chars
          // pushes prompt size where it adds noise without signal.
          errors.push(isKo ? "설명은 4000자 이내로 작성하세요." : "Description must be 4000 chars or fewer.");
        }
        return errors;
      }
      case "pricing": {
        const price = parseFloat(form.basePrice);
        if (!Number.isFinite(price) || price <= 0) return [tw("validation.basePrice")];
        // Currency-aware sanity ceiling. The earlier flat 100,000 cap was
        // currency-blind — fine for USD/EUR/GBP but tripped legitimate
        // KRW/JPY/VND prices (a $90 product is 121,900 KRW, well under
        // any reasonable typo threshold). Use a per-currency ceiling that
        // catches "one too many zeros" without rejecting normal pricing.
        const ceiling = priceCeilingFor(form.currency);
        if (price > ceiling) {
          return [
            isKo
              ? `기본 가격이 비정상적으로 높습니다 (${form.currency} 기준 ${ceiling.toLocaleString()} 이하). 자릿수를 확인하세요.`
              : `Base price looks unrealistically high (max ${ceiling.toLocaleString()} ${form.currency}). Check the digits.`,
          ];
        }
        return [];
      }
      case "countries": {
        const errors: string[] = [];
        if (form.countries.length === 0) {
          errors.push(tw("validation.countries"));
          return errors;
        }
        // (2026-05-28) Origin == candidate is now allowed. Some users want
        // to validate domestic + export side-by-side (e.g. a Korean brand
        // running KR alongside US/JP to compare home-market success score
        // against export options before allocating launch budget). The
        // simulator handles same-origin / same-target cleanly; only the
        // narrative copy changes from "expand into X" to "validate X".
        // Soft cap — each candidate adds ~1-2 minutes to total sim time
        // and the country-scoring stage produces noisier rankings past
        // ~12 candidates.
        if (form.countries.length > 12) {
          errors.push(
            isKo
              ? `후보 진출국은 최대 12개까지만 분석할 수 있습니다 (현재 ${form.countries.length}개).`
              : `At most 12 candidate markets per analysis (currently ${form.countries.length}).`,
          );
        }
        return errors;
      }
      case "competitors":
        return [];
      case "assets":
        // Both fields optional — validation never blocks. Empty B is
        // surfaced as an inline accuracy notice inside the step itself,
        // not as a hard error.
        return [];
      default:
        return [];
    }
  };

  const stepErrors = validationHints();
  const canAdvance = stepErrors.length === 0;

  /**
   * Walks the API error response and returns a human-readable message.
   * Server returns one of:
   *   - { "error": "string message" }                                — runtime error
   *   - { "error": { "fieldErrors": {field: [msg]}, "formErrors": [] } }  — Zod
   *   - plain text                                                   — fallback
   * We unwrap to a friendly summary so users don't see raw JSON dumps.
   */
  const parseApiError = async (res: Response): Promise<string> => {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === "string") return parsed.error;
      const fieldErrors = parsed?.error?.fieldErrors;
      if (fieldErrors && typeof fieldErrors === "object") {
        const lines = Object.entries(fieldErrors as Record<string, string[]>)
          .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
          .filter(Boolean);
        if (lines.length > 0) return lines.join("\n");
      }
      const formErrors = parsed?.error?.formErrors;
      if (Array.isArray(formErrors) && formErrors.length > 0) {
        return formErrors.join(", ");
      }
    } catch {
      // Not JSON — fall through to raw text.
    }
    return body || tw("validation.submitFailed");
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Extract URLs by regex — robust to whatever the user pasted (newlines,
      // commas, surrounding markdown brackets, trailing punctuation, etc.).
      // We only support http/https here; data: and blob: URLs aren't fetchable
      // by Anthropic vision and would just hit a server-side validation error.
      const extractUrls = (text: string): string[] => {
        if (!text) return [];
        const matches = text.match(/https?:\/\/[^\s,<>"'`)\]]+/g) ?? [];
        return matches.map((u) => u.replace(/[.,;:!?)\]]+$/, ""));
      };
      const competitorUrls = extractUrls(form.competitorUrls);
      // Names: split on newline, trim, drop empties + accidental URLs
      // (which belong in competitorUrls). One name per line.
      const competitorNames = form.competitorNames
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !/^https?:\/\//i.test(s));
      const assetDescriptions = form.assetDescriptions
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      // Merge two sources for assetUrls: (a) URLs from successful
      // file uploads, (b) URLs the user pasted manually into the
      // power-user textarea. Dedup with a Set so they don't double-
      // count when a user uploads then pastes the same returned URL.
      const uploadedUrls = uploads
        .filter((u) => u.status === "done" && u.url)
        .map((u) => u.url!);
      const manualUrls = extractUrls(form.assetUrls);
      const assetUrls = Array.from(new Set([...uploadedUrls, ...manualUrls]));

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
          originatingCountry: form.originatingCountry,
          candidateCountries: form.countries,
          competitorNames,
          competitorUrls,
          locale,
          assetDescriptions,
          assetUrls,
          // v0.2-A: brand strategy hints. Send only non-empty values so
          // the API can skip the DB column entirely when user didn't
          // open the collapsible section.
          founderBackground: form.founderBackground.trim() || undefined,
          channelPriority: form.channelPriority || undefined,
          kolRelationships: form.kolRelationships.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const { projectId } = await res.json();
      capture("project_created", {
        category: form.category,
        country_count: form.countries.length,
        currency: form.currency,
        objective: form.objective,
      });

      // Always go through the ensemble endpoint — hypothesis tier is just
      // an N=1 ensemble. Single source of truth for result rendering, and
      // every project's history shows the same shape.
      const runRes = await fetch(`/api/projects/${projectId}/run-ensemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: form.tier,
          notifyEmail: form.notifyEmail.trim() || undefined,
          locale: currentLocale,
        }),
      });
      if (!runRes.ok) throw new Error(await parseApiError(runRes));
      const { ensembleId } = await runRes.json();
      capture("ensemble_started", {
        project_id: projectId,
        tier: form.tier,
        country_count: form.countries.length,
        notify_email: !!form.notifyEmail.trim(),
      });

      router.push(`/projects/${projectId}/results?ensemble=${ensembleId}`);
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
            <Field label={tw("fields.category")} hint={tw("hints.category")}>
              <select
                className="input"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {(["beauty", "fashion", "food", "health", "electronics", "home", "pet", "saas", "ip", "other"] as const).map((c) => (
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
              <DescriptionStrengthHint text={form.description} />
              <EchoBiasWarning text={form.description} />
            </Field>
            <details className="mt-2 group border border-slate-200 rounded-md bg-slate-50/50 open:bg-white">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center justify-between">
                <span>{tw("brandStrategy.title")}</span>
                <span className="text-xs text-slate-500 group-open:hidden">
                  {tw("brandStrategy.openHint")}
                </span>
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-3 text-sm">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {tw("brandStrategy.intro")}
                </p>
                <Field
                  label={tw("brandStrategy.founder.label")}
                  hint={tw("brandStrategy.founder.hint")}
                >
                  <textarea
                    className="input min-h-[60px] text-sm"
                    placeholder={tw("brandStrategy.founder.placeholder")}
                    maxLength={500}
                    value={form.founderBackground}
                    onChange={(e) => update("founderBackground", e.target.value)}
                  />
                  <CharCounter value={form.founderBackground} min={0} />
                </Field>
                <Field
                  label={tw("brandStrategy.channel.label")}
                  hint={tw("brandStrategy.channel.hint")}
                >
                  <select
                    className="input"
                    value={form.channelPriority}
                    onChange={(e) =>
                      update(
                        "channelPriority",
                        e.target.value as FormState["channelPriority"],
                      )
                    }
                  >
                    <option value="">{tw("brandStrategy.channel.none")}</option>
                    <option value="online_first">{tw("brandStrategy.channel.online_first")}</option>
                    <option value="retail_first">{tw("brandStrategy.channel.retail_first")}</option>
                    <option value="duty_free_first">{tw("brandStrategy.channel.duty_free_first")}</option>
                    <option value="wholesale_first">{tw("brandStrategy.channel.wholesale_first")}</option>
                    <option value="omni">{tw("brandStrategy.channel.omni")}</option>
                  </select>
                </Field>
                <Field
                  label={tw("brandStrategy.kol.label")}
                  hint={tw("brandStrategy.kol.hint")}
                >
                  <textarea
                    className="input min-h-[60px] text-sm"
                    placeholder={tw("brandStrategy.kol.placeholder")}
                    maxLength={500}
                    value={form.kolRelationships}
                    onChange={(e) => update("kolRelationships", e.target.value)}
                  />
                  <CharCounter value={form.kolRelationships} min={0} />
                </Field>
                <details className="mt-1 border border-dashed border-slate-300 rounded-md bg-white open:bg-slate-50/40">
                  <summary className="cursor-pointer select-none px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center justify-between">
                    <span>{tw("brandStrategy.examples.title")}</span>
                    <span className="text-[10px] text-slate-500 group-open:hidden">
                      {tw("brandStrategy.examples.openHint")}
                    </span>
                  </summary>
                  <div className="px-2.5 pb-2.5 pt-1.5 space-y-2.5">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {tw("brandStrategy.examples.intro")}
                    </p>
                    {(
                      [
                        "kolNative",
                        "domainExpert",
                        "indieOrganic",
                      ] as const
                    ).map((slug) => {
                      const founder = tw(`brandStrategy.examples.${slug}.founder`);
                      const channel = tw(
                        `brandStrategy.examples.${slug}.channel`,
                      ) as FormState["channelPriority"];
                      const kol = tw(`brandStrategy.examples.${slug}.kol`);
                      const applied =
                        form.founderBackground === founder &&
                        form.channelPriority === channel &&
                        form.kolRelationships === kol;
                      return (
                        <div
                          key={slug}
                          className="border border-slate-200 rounded p-2 bg-white text-[11px] leading-relaxed"
                        >
                          <div className="font-medium text-slate-800 mb-1">
                            {tw(`brandStrategy.examples.${slug}.name`)}
                          </div>
                          <div className="text-slate-600 space-y-0.5">
                            <div>
                              <span className="text-slate-400">
                                {tw("brandStrategy.examples.rowFounder")}:
                              </span>{" "}
                              {founder}
                            </div>
                            <div>
                              <span className="text-slate-400">
                                {tw("brandStrategy.examples.rowChannel")}:
                              </span>{" "}
                              {channel}
                            </div>
                            <div>
                              <span className="text-slate-400">
                                {tw("brandStrategy.examples.rowKol")}:
                              </span>{" "}
                              {kol}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              update("founderBackground", founder);
                              update("channelPriority", channel);
                              update("kolRelationships", kol);
                            }}
                            className={`mt-1.5 text-[11px] px-2 py-1 rounded border transition ${
                              applied
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {applied
                              ? tw("brandStrategy.examples.applied")
                              : tw("brandStrategy.examples.apply")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            </details>
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
            <div className="mb-5">
              <label className="label">{tw("fields.originatingCountry")}</label>
              <p className="text-xs text-slate-500 mb-2">
                {tw("hints.originatingCountry")}
              </p>
              <select
                className="input w-full max-w-sm"
                value={form.originatingCountry}
                onChange={(e) => update("originatingCountry", e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {locale === "ko" ? c.labelKo : c.labelEn} ({c.code})
                  </option>
                ))}
              </select>
            </div>
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
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
              {tw("countriesOriginHint")}
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
          <>
            <Field
              label={tw("fields.competitorNames")}
              hint={tw("hints.competitorNames")}
              optional
            >
              <textarea
                className="input min-h-[120px] leading-relaxed"
                placeholder={tw("placeholders.competitorNames")}
                value={form.competitorNames}
                onChange={(e) => update("competitorNames", e.target.value)}
              />
            </Field>

            <Field
              label={tw("fields.competitorUrls")}
              hint={tw("hints.competitorUrls")}
              optional
            >
              <textarea
                className="input min-h-[80px] font-mono text-xs leading-relaxed"
                placeholder={"https://competitor1.com\nhttps://competitor2.com"}
                value={form.competitorUrls}
                onChange={(e) => update("competitorUrls", e.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-500">{tw("competitorUrlsFormat")}</p>
            </Field>

            <div className="rounded-md border border-brand/20 bg-brand-50/40 px-3 py-2.5 text-xs text-slate-700 leading-relaxed">
              {tw("competitorResolverHint")}
            </div>
          </>
        )}

        {stepKey === "assets" && (
          <>
            <Field
              label={tw("fields.assetDescriptions")}
              hint={tw("hints.assetDescriptions")}
              optional
            >
              <textarea
                className="input min-h-[120px] leading-relaxed"
                placeholder={tw("placeholders.assetDescriptions")}
                value={form.assetDescriptions}
                onChange={(e) => update("assetDescriptions", e.target.value)}
              />
            </Field>

            {/* Primary creative-image input — file upload. Most users
                don't have hosted mockups pre-launch, so we accept files
                directly and host them on Supabase Storage. The legacy
                URL textarea below is kept behind a disclosure for power
                users who already have public URLs. */}
            <Field
              label={tw("fields.assetUploads")}
              hint={tw("hints.assetUploads")}
              optional
            >
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 hover:border-brand/60 hover:bg-brand-50/30 transition-colors cursor-pointer px-6 py-8 text-center">
                <Upload size={20} className="text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-700">
                  {tw("assetUploadsCta")}
                </span>
                <span className="text-[11px] text-slate-500 mt-1">
                  {tw("assetUploadsLimits")}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                    // Reset value so re-selecting the same file fires onChange.
                    e.target.value = "";
                  }}
                />
              </label>

              {uploads.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {uploads.map((u) => (
                    <div
                      key={u.id}
                      className="relative rounded-md border border-slate-200 bg-white overflow-hidden group"
                    >
                      {u.previewDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.previewDataUrl}
                          alt={u.name}
                          className="w-full aspect-video object-cover bg-slate-100"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-slate-100" />
                      )}
                      {/* Status overlay */}
                      {u.status === "uploading" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                          <Loader2 size={18} className="animate-spin text-brand" />
                        </div>
                      )}
                      {u.status === "error" && (
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-risk-soft/80 px-2 text-center text-[10px] text-risk leading-snug"
                          title={u.error}
                        >
                          {u.error ?? "upload failed"}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeUpload(u.id)}
                        className="absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white"
                        aria-label="Remove"
                      >
                        <XIcon size={11} />
                      </button>
                      <div className="text-[10px] text-slate-500 px-2 py-1 truncate" title={u.name}>
                        {u.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            {/* URL alternative — equal-status sibling to the file
                uploader. Some users already have hosted CDN URLs and
                prefer pasting them directly; both inputs feed the same
                downstream pipeline (assetUrls array on the project). */}
            <Field
              label={tw("fields.assetUrls")}
              hint={tw("hints.assetUrls")}
              optional
            >
              <textarea
                className="input min-h-[80px] font-mono text-xs leading-relaxed"
                placeholder={
                  "https://images.example.com/hero.jpg\nhttps://cdn.example.com/banner.png"
                }
                value={form.assetUrls}
                onChange={(e) => update("assetUrls", e.target.value)}
              />
            </Field>

            {uploads.length === 0 && form.assetUrls.trim().length === 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 leading-relaxed">
                {tw("assetUrlsAccuracyHint")}
              </div>
            )}
          </>
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

            <Field label={tw("tier.label")} hint={tw("tier.hint")}>
              {/* deep_pro intentionally omitted: 50 sims runs ~20 min,
                  exceeds Vercel Pro's 800s maxDuration. The API still
                  accepts the tier for CLI runs. See ensemble_status
                  memory for revival paths. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {(
                  [
                    "hypothesis",
                    "decision",
                    "decision_plus",
                    "deep",
                  ] as const
                ).map((t) => {
                  const active = form.tier === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update("tier", t)}
                      className={clsx(
                        "rounded-lg border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-brand bg-brand-50"
                          : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      <div
                        className={clsx(
                          "text-sm font-semibold",
                          active ? "text-brand" : "text-slate-900",
                        )}
                      >
                        {tw(`tier.${t}.name`)}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                        {tw(`tier.${t}.spec`)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                        {tw(`tier.${t}.desc`)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1.5">
                        {tw(`tier.${t}.time`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>

            {form.tier !== "hypothesis" && (
              <Field
                label={tw("notifyEmail.label")}
                hint={tw("notifyEmail.hint")}
              >
                <input
                  type="email"
                  className="input"
                  placeholder={tw("notifyEmail.placeholder")}
                  value={form.notifyEmail}
                  onChange={(e) => update("notifyEmail", e.target.value)}
                />
              </Field>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-risk-soft bg-risk-soft/40 px-3 py-2 text-sm text-risk">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {stepErrors.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
          {stepErrors.map((e, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Info size={12} className="shrink-0 text-slate-400" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}

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
            disabled={!canAdvance}
            className="btn-primary"
          >
            {t("common.next")}
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !canAdvance}
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

// Defect #11 active sanitizer (Phase E Week 3, 2026-05-16).
// Detects external-market-fact phrases in the description and flags them.
// The simulator echoes facts in the description back as recommendations
// instead of reasoning about them — surfaced first in validation memory
// defect #6, reconfirmed in benchmark v1 (Bibigo 93.3 = description-echo
// inflation of a leakage-high product).
function EchoBiasWarning({ text }: { text: string }) {
  const findings = useMemo(() => detectEchoBias(text), [text]);
  const summary = summarizeEchoBias(findings);
  if (!summary) return null;
  return (
    <div className="mt-2 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <div className="font-medium">
          외부 시장 사실로 보이는 {summary.count}개 표현이 감지되었습니다.
        </div>
        <div className="text-amber-800/90">
          <span className="font-mono text-[11px]">
            {summary.preview.map((p) => `"${p}"`).join(" · ")}
          </span>
          {summary.count > 3 ? ` 외 ${summary.count - 3}건` : ""}
        </div>
        <div>
          시뮬레이션은 이 사실을 추론보다 그대로 echo할 수 있습니다 (정확도
          저하 위험). 제품 본질(원료·기능·타겟·차별점)로 다시 쓰는 것을
          권장합니다.
        </div>
      </div>
    </div>
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
