import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight, Minus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChip } from "@/components/ui/CountryChip";
import { CompareSelector } from "@/components/results/CompareSelector";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";

type SimRow = {
  id: string;
  status: string;
  persona_count: number;
  started_at: string | null;
  completed_at: string | null;
  model_provider: string | null;
};

type Overview = {
  successScore?: number;
  bestCountry?: string;
  bestSegment?: string;
  bestPriceCents?: number;
  riskLevel?: "low" | "medium" | "high";
};

type CountryScore = {
  country: string;
  finalScore: number;
  rank: number;
};

type Pricing = { recommendedPriceCents?: number };

type ResultRow = {
  simulation_id: string;
  overview: Overview | null;
  countries: CountryScore[] | null;
  personas: Array<{ purchaseIntent: number }> | null;
  pricing: Pricing | null;
};

export default async function CompareSimulationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id, locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("compare");
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, product_name, currency")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();
  if (!project) notFound();

  // Pull every completed simulation for this project — used to populate the
  // A/B dropdowns and to default to the latest two when the URL is bare.
  const { data: simsRaw } = await supabase
    .from("simulations")
    .select(
      "id, status, persona_count, started_at, completed_at, model_provider",
    )
    .eq("project_id", id)
    .eq("status", "completed")
    .order("started_at", { ascending: false });
  const sims = (simsRaw ?? []) as SimRow[];

  if (sims.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={project.name} />
        <div className="card text-center py-12 text-sm text-slate-500">
          {t("needTwo")}
          <div className="mt-4">
            <Link
              href={`/projects/${id}`}
              className="text-brand hover:underline text-sm font-medium"
            >
              ← {t("backToProject")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resolve A/B from query params, falling back to the two latest sims.
  const aId = sp.a && sims.find((s) => s.id === sp.a) ? sp.a : sims[0].id;
  const bIdCandidate = sp.b && sims.find((s) => s.id === sp.b) ? sp.b : null;
  const bId =
    bIdCandidate && bIdCandidate !== aId
      ? bIdCandidate
      : sims.find((s) => s.id !== aId)?.id ?? sims[1].id;

  const { data: resultsRaw } = await supabase
    .from("simulation_results")
    .select("simulation_id, overview, countries, personas, pricing")
    .in("simulation_id", [aId, bId]);
  const results = (resultsRaw ?? []) as ResultRow[];

  const aSim = sims.find((s) => s.id === aId)!;
  const bSim = sims.find((s) => s.id === bId)!;
  const aResult = results.find((r) => r.simulation_id === aId);
  const bResult = results.find((r) => r.simulation_id === bId);

  const aMetrics = computeMetrics(aResult);
  const bMetrics = computeMetrics(bResult);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={`${project.name} — ${project.product_name}`}
        actions={
          <Link
            href={`/projects/${id}`}
            className="btn-ghost text-xs"
          >
            <ArrowLeft size={14} />
            {t("backToProject")}
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompareSelector
          projectId={id}
          label={t("simA")}
          slot="a"
          currentValue={aId}
          oppositeValue={bId}
          options={sims.map((s) => ({
            id: s.id,
            label: formatSimLabel(s, locale),
            personaCount: s.persona_count,
            modelProvider: s.model_provider,
          }))}
        />
        <CompareSelector
          projectId={id}
          label={t("simB")}
          slot="b"
          currentValue={bId}
          oppositeValue={aId}
          options={sims.map((s) => ({
            id: s.id,
            label: formatSimLabel(s, locale),
            personaCount: s.persona_count,
            modelProvider: s.model_provider,
          }))}
        />
      </div>

      <div className="card">
        <SectionTitle>{t("section.overview")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <CompareKpi
            label={t("metric.successScore")}
            a={aMetrics.successScore}
            b={bMetrics.successScore}
            format={(v) => (v !== undefined ? `${v}%` : "—")}
            higherIsBetter
          />
          <CompareKpi
            label={t("metric.recommendedPrice")}
            a={aMetrics.priceUsd}
            b={bMetrics.priceUsd}
            format={(v) => (v !== undefined ? `$${v.toFixed(2)}` : "—")}
            currency={project.currency ?? "USD"}
          />
          <CompareKpi
            label={t("metric.avgIntent")}
            a={aMetrics.avgIntent}
            b={bMetrics.avgIntent}
            format={(v) => (v !== undefined ? `${v}/100` : "—")}
            higherIsBetter
          />
          <CompareInfo
            label={t("metric.bestCountry")}
            a={aResult?.overview?.bestCountry}
            b={bResult?.overview?.bestCountry}
            renderValue={(v) =>
              v ? getCountryLabel(v, locale) || v : "—"
            }
          />
          <CompareInfo
            label={t("metric.riskLevel")}
            a={aResult?.overview?.riskLevel}
            b={bResult?.overview?.riskLevel}
            renderValue={(v) => (v ?? "—").toUpperCase()}
          />
          <CompareKpi
            label={t("metric.personaCount")}
            a={aSim.persona_count}
            b={bSim.persona_count}
            format={(v) => (v !== undefined ? v.toString() : "—")}
          />
        </div>
      </div>

      <div className="card">
        <SectionTitle>{t("section.topCountries")}</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <CountryRanking
            countries={aResult?.countries ?? []}
            locale={locale}
            label={`A — ${formatSimLabel(aSim, locale)}`}
          />
          <CountryRanking
            countries={bResult?.countries ?? []}
            locale={locale}
            label={`B — ${formatSimLabel(bSim, locale)}`}
          />
        </div>
      </div>
    </div>
  );
}

function computeMetrics(r: ResultRow | undefined) {
  return {
    successScore: r?.overview?.successScore,
    priceUsd:
      r?.pricing?.recommendedPriceCents !== undefined
        ? r.pricing.recommendedPriceCents / 100
        : undefined,
    avgIntent:
      r?.personas && r.personas.length > 0
        ? Math.round(
            r.personas.reduce((s, p) => s + (p.purchaseIntent ?? 0), 0) /
              r.personas.length,
          )
        : undefined,
  };
}

function formatSimLabel(s: SimRow, locale: string): string {
  const date = s.started_at
    ? new Date(s.started_at).toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : s.id.slice(0, 8);
  return `${date} · ${s.persona_count}p`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </h2>
  );
}

function CompareKpi({
  label,
  a,
  b,
  format,
  higherIsBetter,
  currency,
}: {
  label: string;
  a: number | undefined;
  b: number | undefined;
  format: (v: number | undefined) => string;
  higherIsBetter?: boolean;
  currency?: string;
}) {
  const delta =
    a !== undefined && b !== undefined && a !== b ? b - a : undefined;
  const deltaSign =
    delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone =
    delta === undefined || higherIsBetter === undefined
      ? "neutral"
      : (higherIsBetter && deltaSign === "up") ||
          (!higherIsBetter && deltaSign === "down")
        ? "good"
        : deltaSign === "flat"
          ? "neutral"
          : "bad";
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="font-mono text-slate-900">{format(a)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="font-mono text-slate-900">{format(b)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <DeltaBadge sign={deltaSign} tone={tone} />
        {delta !== undefined && (
          <span className="text-slate-500 tabular-nums">
            Δ {delta > 0 ? "+" : ""}
            {currency ? `${delta.toFixed(2)}` : Math.round(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function CompareInfo({
  label,
  a,
  b,
  renderValue,
}: {
  label: string;
  a: string | undefined;
  b: string | undefined;
  renderValue: (v: string | undefined) => string;
}) {
  const same = a === b;
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="text-slate-900 font-medium">{renderValue(a)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="text-slate-900 font-medium">{renderValue(b)}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {same ? "—" : "≠"}
      </div>
    </div>
  );
}

function DeltaBadge({
  sign,
  tone,
}: {
  sign: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}) {
  const Icon = sign === "up" ? ArrowRight : sign === "down" ? ArrowLeft : Minus;
  const cls =
    tone === "good"
      ? "bg-success-soft text-success"
      : tone === "bad"
        ? "bg-risk-soft text-risk"
        : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cls}`}
    >
      <Icon size={11} className={sign === "up" ? "rotate-[-45deg]" : sign === "down" ? "rotate-[-135deg]" : ""} />
    </span>
  );
}

function CountryRanking({
  countries,
  locale,
  label,
}: {
  countries: CountryScore[];
  locale: string;
  label: string;
}) {
  const sorted = [...countries].sort((a, b) => a.rank - b.rank).slice(0, 5);
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {label}
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((c) => (
            <li
              key={c.country}
              className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 tabular-nums">
                  {c.rank}
                </span>
                <CountryChip code={c.country} size="sm" />
                <span className="text-slate-700">
                  {getCountryLabel(c.country, locale) || c.country}
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {c.finalScore.toFixed(0)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
