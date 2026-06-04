import { setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { createServiceClient } from "@/lib/supabase/server";

interface OutcomeRow {
  id: string;
  workspace_id: string;
  project_id: string;
  submitted_at: string;
  launch_status: string;
  launch_country: string | null;
  launch_date: string | null;
  notes: string | null;
  recommendation_country: string | null;
  recommendation_confidence: "STRONG" | "MODERATE" | "WEAK" | null;
  matched_recommendation: boolean | null;
}

interface ProjectRow {
  id: string;
  name: string | null;
  product_name: string | null;
  category: string | null;
}

/**
 * Admin → Outcomes page. Aggregates real launch outcomes submitted by
 * users (outcome_feedback table) to compute production accuracy KPI:
 *   - Hit rate overall + by confidence tier (STRONG/MODERATE/WEAK)
 *   - Recent submissions table (sortable visual scan)
 *
 * Phase 2 will add: calibration curve, per-category breakdown,
 * auto-benchmark fixture seeding from this data.
 */
export default async function AdminOutcomesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";

  const admin = createServiceClient();
  const { data: outcomesData } = await admin
    .from("outcome_feedback")
    .select(
      "id, workspace_id, project_id, submitted_at, launch_status, launch_country, launch_date, notes, recommendation_country, recommendation_confidence, matched_recommendation",
    )
    .order("submitted_at", { ascending: false })
    .limit(200);
  const outcomes = (outcomesData ?? []) as OutcomeRow[];

  const projectIds = Array.from(new Set(outcomes.map((o) => o.project_id)));
  const { data: projectsData } =
    projectIds.length > 0
      ? await admin
          .from("projects")
          .select("id, name, product_name, category")
          .in("id", projectIds)
      : { data: [] };
  const projectMap = new Map<string, ProjectRow>(
    ((projectsData ?? []) as ProjectRow[]).map((p) => [p.id, p]),
  );

  // KPIs
  const total = outcomes.length;
  const measurable = outcomes.filter((o) => o.matched_recommendation !== null);
  const hits = measurable.filter((o) => o.matched_recommendation === true);
  const hitRate =
    measurable.length > 0 ? Math.round((hits.length / measurable.length) * 100) : null;

  const byConfidence = (conf: "STRONG" | "MODERATE" | "WEAK") => {
    const subset = measurable.filter(
      (o) => o.recommendation_confidence === conf,
    );
    const subsetHits = subset.filter((o) => o.matched_recommendation === true);
    return {
      n: subset.length,
      hitRate:
        subset.length > 0
          ? Math.round((subsetHits.length / subset.length) * 100)
          : null,
    };
  };
  const strong = byConfidence("STRONG");
  const moderate = byConfidence("MODERATE");
  const weak = byConfidence("WEAK");

  const byStatus = new Map<string, number>();
  for (const o of outcomes) {
    byStatus.set(o.launch_status, (byStatus.get(o.launch_status) ?? 0) + 1);
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(isKo ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {isKo ? "런칭 결과 (Production Accuracy)" : "Launch outcomes (Production Accuracy)"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isKo
            ? "사용자가 실제 런칭한 결과 vs 시뮬 추천. matched_recommendation 이 true 면 hit. STRONG/MODERATE/WEAK 별 hit률은 confidence calibration 의 진실 측정."
            : "Real user launch outcomes vs sim recommendation. matched_recommendation=true means hit. Per-confidence hit rates measure calibration honesty."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={isKo ? "총 제출" : "Total submissions"}
          value={total}
          hint={
            isKo
              ? `${measurable.length}개 측정 가능 (launch_country 있음)`
              : `${measurable.length} measurable`
          }
        />
        <KpiCard
          label={isKo ? "전체 hit률" : "Overall hit rate"}
          value={hitRate !== null ? `${hitRate}%` : "—"}
          hint={
            isKo
              ? `${hits.length}/${measurable.length} matched`
              : `${hits.length}/${measurable.length} matched`
          }
          tone={
            hitRate === null
              ? "default"
              : hitRate >= 70
                ? "success"
                : hitRate >= 50
                  ? "warn"
                  : "risk"
          }
        />
        <KpiCard
          label={isKo ? "STRONG hit률" : "STRONG hit rate"}
          value={strong.hitRate !== null ? `${strong.hitRate}%` : "—"}
          hint={`n=${strong.n}`}
          tone={
            strong.hitRate === null
              ? "default"
              : strong.hitRate >= 80
                ? "success"
                : strong.hitRate >= 60
                  ? "warn"
                  : "risk"
          }
        />
        <KpiCard
          label={isKo ? "WEAK hit률" : "WEAK hit rate"}
          value={weak.hitRate !== null ? `${weak.hitRate}%` : "—"}
          hint={`n=${weak.n}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold mb-3">
            {isKo
              ? "Confidence calibration (실측)"
              : "Confidence calibration (measured)"}
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            {isKo
              ? "각 confidence tier 의 실제 hit률. STRONG ≥ 80% 가 정직성 KPI. 데이터 30+ 모이기 전까지는 N=small noise."
              : "Real hit rate per confidence tier. STRONG ≥80% is the honesty KPI. n<30 = noise."}
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="text-left py-1">Confidence</th>
                <th className="text-right py-1">n</th>
                <th className="text-right py-1">Hit %</th>
                <th className="text-left py-1 pl-3">
                  {isKo ? "기대 정확도" : "Expected"}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1.5 font-medium">STRONG</td>
                <td className="text-right tabular-nums">{strong.n}</td>
                <td className="text-right tabular-nums">
                  {strong.hitRate !== null ? `${strong.hitRate}%` : "—"}
                </td>
                <td className="text-xs text-slate-500 pl-3">≥80%</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-1.5 font-medium">MODERATE</td>
                <td className="text-right tabular-nums">{moderate.n}</td>
                <td className="text-right tabular-nums">
                  {moderate.hitRate !== null ? `${moderate.hitRate}%` : "—"}
                </td>
                <td className="text-xs text-slate-500 pl-3">50-80%</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">WEAK</td>
                <td className="text-right tabular-nums">{weak.n}</td>
                <td className="text-right tabular-nums">
                  {weak.hitRate !== null ? `${weak.hitRate}%` : "—"}
                </td>
                <td className="text-xs text-slate-500 pl-3">≤50%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold mb-3">
            {isKo ? "런칭 상태 분포" : "Launch status distribution"}
          </h2>
          <div className="space-y-1.5 text-sm">
            {(["launched", "pivoted", "planning", "abandoned"] as const).map(
              (st) => {
                const n = byStatus.get(st) ?? 0;
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                return (
                  <div key={st} className="flex items-center gap-2">
                    <span className="w-20 text-slate-600 capitalize text-xs">
                      {st}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-slate-700 w-10 text-right">
                      {n}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-base font-semibold mb-3">
          {isKo ? "최근 제출 (최대 50건)" : "Recent submissions (top 50)"}
        </h2>
        {outcomes.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            {isKo
              ? "아직 제출된 outcome 이 없습니다. 사용자가 ensemble result 페이지에서 \"런칭 결과 공유\" 버튼을 클릭하면 채워집니다."
              : "No outcomes yet. Users submit via the \"Share launch outcome\" button on ensemble results."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="text-left py-1.5">Submitted</th>
                  <th className="text-left py-1.5">Project</th>
                  <th className="text-left py-1.5">Status</th>
                  <th className="text-center py-1.5">Launch</th>
                  <th className="text-center py-1.5">Sim</th>
                  <th className="text-center py-1.5">Confidence</th>
                  <th className="text-center py-1.5">Match</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.slice(0, 50).map((o) => {
                  const project = projectMap.get(o.project_id);
                  const matched = o.matched_recommendation;
                  return (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="py-1.5 text-xs text-slate-600">
                        {formatDate(o.submitted_at)}
                      </td>
                      <td className="py-1.5 text-slate-800">
                        {project?.product_name ?? project?.name ?? o.project_id.slice(0, 8)}
                      </td>
                      <td className="py-1.5 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 capitalize">
                          {o.launch_status}
                        </span>
                      </td>
                      <td className="text-center font-mono text-xs">
                        {o.launch_country ?? "—"}
                      </td>
                      <td className="text-center font-mono text-xs">
                        {o.recommendation_country ?? "—"}
                      </td>
                      <td className="text-center text-xs">
                        {o.recommendation_confidence ?? "—"}
                      </td>
                      <td className="text-center">
                        {matched === null ? (
                          <span className="text-slate-300">—</span>
                        ) : matched ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-rose-600">✗</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
