import { setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  isGenericPriceObjection,
  isGenericTrustFactor,
} from "@/lib/simulation/surfaced-recount";

interface QualityRow {
  simulation_id: string;
  workspace_id: string;
  audited_at: string;
  confidence_score: number;
  quarantined: boolean;
  voice_slip_rate: number | null;
  country_score_range: number | null;
  profession_diversity: number | null;
  income_drift_pct: number | null;
  price_in_band: boolean | null;
  synthesis_failover: boolean | null;
  voice_homogeneity: number | null;
  channel_mismatch_rate: number | null;
  warnings: Array<{ code: string; severity: string; message: string }> | null;
}

interface SimMetaRow {
  id: string;
  workspace_id: string | null;
  ensemble_id: string | null;
  model_provider: string | null;
  ensembles?: { tier?: string; project_id?: string } | { tier?: string; project_id?: string }[] | null;
  projects?: { name?: string; product_name?: string; category?: string | null } | { name?: string; product_name?: string; category?: string | null }[] | null;
}

/**
 * Admin sim-quality dashboard. Snapshot of:
 *   - confidence-score distribution (last 30d)
 *   - per-tier / per-provider / per-category breakdowns
 *   - top warning codes (which check fires most often)
 *   - quarantined sim list (ones that actually got blocked)
 *
 * Drives the "are our outputs trustworthy" question from real data.
 * Read-only — fixing a bad sim still requires re-running it.
 */
export default async function AdminSimQualityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const admin = createServiceClient();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawQuality } = await admin
    .from("simulation_quality")
    .select(
      "simulation_id, workspace_id, audited_at, confidence_score, quarantined, voice_slip_rate, country_score_range, profession_diversity, income_drift_pct, price_in_band, synthesis_failover, voice_homogeneity, channel_mismatch_rate, warnings",
    )
    .gte("audited_at", since30d)
    .order("audited_at", { ascending: false })
    .limit(2000);

  const quality = (rawQuality ?? []) as QualityRow[];

  const simIds = quality.map((q) => q.simulation_id);
  const { data: rawMeta } = await admin
    .from("simulations")
    .select(
      `id, workspace_id, ensemble_id, model_provider,
       ensembles(tier, project_id),
       projects(name, product_name, category)`,
    )
    .in("id", simIds.length > 0 ? simIds : ["00000000-0000-0000-0000-000000000000"]);
  const meta = (rawMeta ?? []) as unknown as SimMetaRow[];
  const metaById = new Map<string, SimMetaRow>(meta.map((m) => [m.id, m]));

  // ── Aggregate stats ─────────────────────────────────────────────
  const total = quality.length;
  const meanConfidence =
    total > 0 ? Math.round(quality.reduce((s, q) => s + q.confidence_score, 0) / total) : 0;
  const quarantined = quality.filter((q) => q.quarantined).length;
  const lowConfidence = quality.filter((q) => q.confidence_score < 60).length;
  const failoverFired = quality.filter((q) => q.synthesis_failover).length;

  // Confidence score histogram (10-pt bins)
  const histogram: number[] = new Array(10).fill(0);
  for (const q of quality) {
    const bin = Math.min(9, Math.floor(q.confidence_score / 10));
    histogram[bin]++;
  }

  // Top warning codes
  const codeCounts = new Map<string, { count: number; severity: string }>();
  for (const q of quality) {
    for (const w of q.warnings ?? []) {
      const cur = codeCounts.get(w.code);
      if (cur) cur.count++;
      else codeCounts.set(w.code, { count: 1, severity: w.severity });
    }
  }
  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  // Per-tier breakdown
  type TierAgg = { count: number; totalConf: number; quarantined: number };
  const byTier = new Map<string, TierAgg>();
  for (const q of quality) {
    const m = metaById.get(q.simulation_id);
    const ens = m?.ensembles;
    const tier = (Array.isArray(ens) ? ens[0]?.tier : ens?.tier) ?? "standalone";
    const cur = byTier.get(tier) ?? { count: 0, totalConf: 0, quarantined: 0 };
    cur.count++;
    cur.totalConf += q.confidence_score;
    if (q.quarantined) cur.quarantined++;
    byTier.set(tier, cur);
  }

  // Per-provider breakdown
  type ProvAgg = { count: number; totalConf: number; quarantined: number };
  const byProvider = new Map<string, ProvAgg>();
  for (const q of quality) {
    const m = metaById.get(q.simulation_id);
    const prov = m?.model_provider ?? "unknown";
    const cur = byProvider.get(prov) ?? { count: 0, totalConf: 0, quarantined: 0 };
    cur.count++;
    cur.totalConf += q.confidence_score;
    if (q.quarantined) cur.quarantined++;
    byProvider.set(prov, cur);
  }

  // ── Persona quality (last 7d, sample of 50 most-recent sims) ─────
  // Pulls actual persona arrays from simulation_results to compute
  // generic-price / generic-trust rates by income bracket. Sampled
  // (not all 30d) because each sim has 200 personas — 50 sims × 200
  // = 10K rows is fast; 2K sims × 200 = 400K is not.
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentSims } = await admin
    .from("simulations")
    .select("id, simulation_results(personas)")
    .eq("status", "completed")
    .gte("started_at", since7d)
    .order("started_at", { ascending: false })
    .limit(50);

  type PersonaRecord = {
    incomeBand?: string;
    objections?: string[];
    trustFactors?: string[];
    purchaseIntent?: number;
  };
  type SimResultsShape = { personas?: PersonaRecord[] } | { personas?: PersonaRecord[] }[] | null;
  type PersonaBucket = {
    total: number;
    withGenericPrice: number;
    withSpecificPrice: number;
    withGenericTrust: number;
    intentSum: number;
  };
  const personaBuckets = new Map<string, PersonaBucket>();
  let personaTotal = 0;
  let personaGenericPrice = 0;
  let personaGenericTrust = 0;
  for (const s of recentSims ?? []) {
    const r = s.simulation_results as SimResultsShape;
    const personas: PersonaRecord[] = Array.isArray(r) ? (r[0]?.personas ?? []) : (r?.personas ?? []);
    for (const p of personas) {
      const bracket = parseIncomeBracket(p.incomeBand);
      const cur =
        personaBuckets.get(bracket) ??
        ({
          total: 0,
          withGenericPrice: 0,
          withSpecificPrice: 0,
          withGenericTrust: 0,
          intentSum: 0,
        } as PersonaBucket);
      cur.total += 1;
      cur.intentSum += p.purchaseIntent ?? 0;
      const objs = p.objections ?? [];
      const trusts = p.trustFactors ?? [];
      const hasGenericPrice = objs.some(isGenericPriceObjection);
      const hasGenericTrust = trusts.some(isGenericTrustFactor);
      const hasAnyPrice = objs.some((o) =>
        /가격|비싸|비쌈|부담|expensive|costly|pricey|cost|too\s+(high|much)/i.test(o),
      );
      if (hasGenericPrice) cur.withGenericPrice += 1;
      if (hasAnyPrice && !hasGenericPrice) cur.withSpecificPrice += 1;
      if (hasGenericTrust) cur.withGenericTrust += 1;
      personaBuckets.set(bracket, cur);
      personaTotal += 1;
      if (hasGenericPrice) personaGenericPrice += 1;
      if (hasGenericTrust) personaGenericTrust += 1;
    }
  }
  const personaBracketOrder = [
    "<$30k",
    "$30-60k",
    "$60-100k",
    "$100-150k",
    "$150k+",
    "(unparsed)",
  ];

  // Quarantine list
  const quarantineRows = quality
    .filter((q) => q.quarantined)
    .slice(0, 30)
    .map((q) => {
      const m = metaById.get(q.simulation_id);
      const ens = m?.ensembles;
      const proj = m?.projects;
      return {
        simId: q.simulation_id,
        workspaceId: q.workspace_id,
        confidence: q.confidence_score,
        auditedAt: q.audited_at,
        provider: m?.model_provider ?? "—",
        tier: (Array.isArray(ens) ? ens[0]?.tier : ens?.tier) ?? "—",
        projectName: (Array.isArray(proj) ? proj[0]?.name : proj?.name) ?? "—",
        productName: (Array.isArray(proj) ? proj[0]?.product_name : proj?.product_name) ?? "—",
        topWarning: (q.warnings ?? []).find((w) => w.severity === "critical")?.code ?? "—",
      };
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isKo ? "시뮬레이션 품질 감사" : "Simulation Quality Audit"}
        subtitle={
          isKo
            ? "최근 30일 자동 sanity check 결과 — 시뮬마다 confidence 점수 + 경고가 기록됩니다."
            : "Last 30d of automated sanity-check results — confidence score + warnings per sim."
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard
          label={isKo ? "감사된 시뮬" : "Audited sims"}
          value={total.toLocaleString()}
          hint={isKo ? "최근 30일" : "Last 30 days"}
        />
        <KpiCard
          label={isKo ? "평균 confidence" : "Mean confidence"}
          value={`${meanConfidence}`}
          hint={isKo ? "/100" : "/100"}
          tone={meanConfidence >= 80 ? "success" : meanConfidence >= 60 ? "warn" : "risk"}
        />
        <KpiCard
          label={isKo ? "격리됨" : "Quarantined"}
          value={quarantined.toLocaleString()}
          hint={total > 0 ? `${Math.round((quarantined / total) * 100)}%` : "—"}
          tone={quarantined > 0 ? "risk" : "default"}
        />
        <KpiCard
          label={isKo ? "낮은 신뢰도 (<60)" : "Low confidence (<60)"}
          value={lowConfidence.toLocaleString()}
          hint={total > 0 ? `${Math.round((lowConfidence / total) * 100)}%` : "—"}
          tone={lowConfidence > total * 0.1 ? "warn" : "default"}
        />
      </div>

      {/* Confidence histogram */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "신뢰도 분포" : "Confidence distribution"}
        </h2>
        <div className="flex items-end gap-1 h-40">
          {histogram.map((count, i) => {
            const max = Math.max(...histogram, 1);
            const height = (count / max) * 100;
            const tone = i >= 8 ? "bg-success" : i >= 6 ? "bg-warn" : "bg-risk";
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t ${tone}`}
                    style={{ height: `${height}%`, minHeight: count > 0 ? 2 : 0 }}
                    title={`${i * 10}-${i * 10 + 9}: ${count}`}
                  />
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">{i * 10}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top warning codes */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "자주 발생한 경고" : "Top warning codes"}
          </h2>
          {topCodes.length === 0 ? (
            <p className="text-sm text-slate-500">{isKo ? "경고 없음 — 모든 시뮬 통과" : "No warnings — every sim passed"}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">{isKo ? "코드" : "Code"}</th>
                  <th className="text-left py-2 px-3 font-medium">{isKo ? "심각도" : "Sev"}</th>
                  <th className="text-right py-2 pl-3 font-medium">{isKo ? "건수" : "Count"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topCodes.map(([code, v]) => (
                  <tr key={code}>
                    <td className="py-2 pr-3 font-mono text-xs">{code}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                          v.severity === "critical"
                            ? "bg-risk-soft text-risk"
                            : v.severity === "warning"
                              ? "bg-warn-soft text-warn"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {v.severity}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">{v.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Per-provider breakdown */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "Provider별 평균 confidence" : "Mean confidence by provider"}
          </h2>
          {byProvider.size === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Provider</th>
                  <th className="text-right py-2 px-3 font-medium">{isKo ? "평균" : "Mean"}</th>
                  <th className="text-right py-2 px-3 font-medium">{isKo ? "격리" : "Quar."}</th>
                  <th className="text-right py-2 pl-3 font-medium">{isKo ? "건수" : "Sims"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...byProvider.entries()]
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([prov, agg]) => {
                    const meanConf = Math.round(agg.totalConf / agg.count);
                    return (
                      <tr key={prov}>
                        <td className="py-2 pr-3 font-medium">{prov}</td>
                        <td
                          className={`py-2 px-3 text-right tabular-nums font-semibold ${
                            meanConf >= 80
                              ? "text-success"
                              : meanConf >= 60
                                ? "text-warn"
                                : "text-risk"
                          }`}
                        >
                          {meanConf}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                          {agg.quarantined}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums text-slate-600">
                          {agg.count}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>

        {/* Per-tier breakdown */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "Tier별 평균 confidence" : "Mean confidence by tier"}
          </h2>
          {byTier.size === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Tier</th>
                  <th className="text-right py-2 px-3 font-medium">{isKo ? "평균 confidence" : "Mean confidence"}</th>
                  <th className="text-right py-2 px-3 font-medium">{isKo ? "격리됨" : "Quarantined"}</th>
                  <th className="text-right py-2 pl-3 font-medium">{isKo ? "시뮬 수" : "Sim count"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...byTier.entries()]
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([tier, agg]) => {
                    const meanConf = Math.round(agg.totalConf / agg.count);
                    return (
                      <tr key={tier}>
                        <td className="py-2 pr-3 font-medium">{tier}</td>
                        <td
                          className={`py-2 px-3 text-right tabular-nums font-semibold ${
                            meanConf >= 80
                              ? "text-success"
                              : meanConf >= 60
                                ? "text-warn"
                                : "text-risk"
                          }`}
                        >
                          {meanConf}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                          {agg.quarantined}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums text-slate-600">
                          {agg.count}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quarantined sim list */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "격리된 시뮬 (최근 30개)" : "Quarantined sims (latest 30)"}
        </h2>
        {quarantineRows.length === 0 ? (
          <p className="text-sm text-slate-500">{isKo ? "격리된 시뮬 없음 ✓" : "No quarantined sims ✓"}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">{isKo ? "시간" : "When"}</th>
                  <th className="text-left py-2 px-3 font-medium">Sim</th>
                  <th className="text-left py-2 px-3 font-medium">{isKo ? "프로젝트" : "Project"}</th>
                  <th className="text-left py-2 px-3 font-medium">Tier / Provider</th>
                  <th className="text-right py-2 px-3 font-medium">Conf.</th>
                  <th className="text-left py-2 pl-3 font-medium">{isKo ? "트리거" : "Trigger"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quarantineRows.map((r) => (
                  <tr key={r.simId}>
                    <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.auditedAt).toLocaleString(isKo ? "ko-KR" : "en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                      {r.simId.slice(0, 8)}
                    </td>
                    <td className="py-2 px-3 text-slate-700 max-w-[200px] truncate">
                      {r.productName}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">
                      {r.tier} · {r.provider}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-risk">
                      {r.confidence}
                    </td>
                    <td className="py-2 pl-3">
                      <span className="font-mono text-[11px] text-slate-600">{r.topWarning}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Persona quality audit — generic-price / generic-trust rates
          by income bracket. The aggregator + render-time filters drop
          generic phrasings before they hit the report, but this panel
          shows the upstream rate so we can spot the LLM regressing
          (high-income personas suddenly grumbling generically about
          price = LLM ignoring income context). Sample of last 7 days,
          50 most-recent sims. */}
      {personaTotal > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            {isKo ? "페르소나 품질 감사" : "Persona quality audit"}
          </h2>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            {isKo
              ? `최근 7일 50개 시뮬 샘플 (${personaTotal.toLocaleString()}명 페르소나). 일반 가격 거부 / 일반 신뢰 발언이 소득 구간별로 어느 비율인지 추적합니다. 고소득(\\$100k+) generic-price 비율이 평소보다 크게 올라가면 LLM이 income context를 무시하고 reflexively 발언하는 회귀 신호입니다.`
              : `Last 7 days, 50 most-recent sims (${personaTotal.toLocaleString()} personas). Tracks the upstream rate of generic price grumbles / generic trust factors by income bracket. A spike in high-income generic-price rate is a regression signal — the LLM is ignoring income context and emitting price-as-objection reflexively.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <KpiCard
              label={isKo ? "일반 가격 거부 (전체)" : "Generic price (overall)"}
              value={`${Math.round((personaGenericPrice / personaTotal) * 100)}%`}
              hint={`${personaGenericPrice.toLocaleString()} / ${personaTotal.toLocaleString()}`}
              tone={
                personaGenericPrice / personaTotal > 0.2
                  ? "warn"
                  : personaGenericPrice / personaTotal > 0.1
                    ? "default"
                    : "success"
              }
            />
            <KpiCard
              label={isKo ? "일반 신뢰 (전체)" : "Generic trust (overall)"}
              value={`${Math.round((personaGenericTrust / personaTotal) * 100)}%`}
              hint={`${personaGenericTrust.toLocaleString()} / ${personaTotal.toLocaleString()}`}
              tone={
                personaGenericTrust / personaTotal > 0.4
                  ? "warn"
                  : personaGenericTrust / personaTotal > 0.2
                    ? "default"
                    : "success"
              }
            />
            <KpiCard
              label={isKo ? "샘플 sims" : "Sample sims"}
              value={(recentSims?.length ?? 0).toString()}
              hint={isKo ? "최근 7일" : "Last 7 days"}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">
                    {isKo ? "소득 구간" : "Income bracket"}
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    {isKo ? "페르소나" : "Personas"}
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    {isKo ? "일반 가격" : "Generic price"}
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    {isKo ? "구체 가격" : "Specific price"}
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    {isKo ? "일반 신뢰" : "Generic trust"}
                  </th>
                  <th className="text-right py-2 pl-3 font-medium">
                    {isKo ? "평균 의향" : "Mean intent"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personaBracketOrder.map((bracket) => {
                  const b = personaBuckets.get(bracket);
                  if (!b) return null;
                  const genericPct = Math.round((b.withGenericPrice / b.total) * 100);
                  const specificPct = Math.round((b.withSpecificPrice / b.total) * 100);
                  const genericTrustPct = Math.round((b.withGenericTrust / b.total) * 100);
                  const meanIntent = b.total > 0 ? Math.round(b.intentSum / b.total) : 0;
                  // Flag high-income brackets with elevated generic-price rate
                  // — that's the LLM-regression signal worth surfacing.
                  const isHighIncome =
                    bracket === "$100-150k" || bracket === "$150k+";
                  const flagged = isHighIncome && genericPct > 10;
                  return (
                    <tr key={bracket} className={flagged ? "bg-warn-soft/30" : ""}>
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {bracket}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        {b.total.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 px-3 text-right tabular-nums ${flagged ? "text-warn font-semibold" : "text-slate-600"}`}
                      >
                        {genericPct}%
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        {specificPct}%
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                        {genericTrustPct}%
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-600">
                        {meanIntent}/100
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            {isKo
              ? "주황색 행 = 고소득 페르소나의 일반 가격 거부 비율이 10% 초과 (LLM income context 회귀 가능 신호). 정상치: 저소득 > 중간 > 고소득 순으로 비율이 떨어져야 함."
              : "Amber row = high-income generic-price rate exceeds 10% (potential LLM-context regression). Healthy distribution: low-income > mid > high."}
          </p>
        </div>
      )}

      {/* Failover stat — informational, not a problem */}
      {failoverFired > 0 && (
        <div className="card p-4 bg-slate-50 border-slate-200">
          <p className="text-xs text-slate-600 leading-relaxed">
            {isKo
              ? `Synthesis failover가 ${failoverFired}회 발생 (${total > 0 ? Math.round((failoverFired / total) * 100) : 0}%). 정상 — 주 LLM이 503/429를 반환했을 때 백업 provider로 자동 전환된 사례입니다.`
              : `Synthesis failover fired ${failoverFired} times (${total > 0 ? Math.round((failoverFired / total) * 100) : 0}%). Normal — these are sims where the primary LLM returned 5xx/429 and we routed to the backup provider.`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Parse a persona's incomeBand text into a USD-K bucket label. Each
 * persona prompt requires the USD equivalent in parentheses for non-USD
 * currencies; native-USD personas write "$X-Y" directly. Returns
 * "(unparsed)" when nothing matches — covers students / homemakers /
 * retirees with non-salary income strings.
 */
function parseIncomeBracket(incomeBand: string | undefined): string {
  if (!incomeBand) return "(unparsed)";
  const range = incomeBand.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*k/i);
  let usdK: number | null = null;
  if (range) {
    usdK = (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  } else {
    const single = incomeBand.match(/\$\s*(\d+(?:\.\d+)?)\s*k/i);
    if (single) usdK = parseFloat(single[1]);
  }
  if (usdK == null) return "(unparsed)";
  if (usdK < 30) return "<$30k";
  if (usdK < 60) return "$30-60k";
  if (usdK < 100) return "$60-100k";
  if (usdK < 150) return "$100-150k";
  return "$150k+";
}
