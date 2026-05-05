import { setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";

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
      "simulation_id, workspace_id, audited_at, confidence_score, quarantined, voice_slip_rate, country_score_range, profession_diversity, income_drift_pct, price_in_band, synthesis_failover, voice_homogeneity, warnings",
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
