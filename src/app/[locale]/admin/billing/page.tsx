import { setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { createServiceClient } from "@/lib/supabase/server";
import { formatCentsUsd } from "@/lib/llm/cost";
import { getBillingReadiness } from "@/lib/billing/readiness";

interface SimRow {
  id: string;
  workspace_id: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  completed_at: string | null;
  started_at: string | null;
  status: string;
  model_provider: string | null;
}

// Inline label map for the billing-readiness panel. Lives in the page
// file (not the shared messages/{ko,en}.json) because the admin surface
// is operator-only and bi-lingual via a simple ternary is enough — adding
// 30+ keys to the project's main i18n catalog would just bloat it.
function billingReadinessLabels(isKo: boolean) {
  return {
    title: isKo ? "🟢 결제 가동 준비 상태" : "🟢 Billing activation readiness",
    subtitle: isKo
      ? "Stripe·Toss 환경변수와 dashboard 액션 상태. 모든 항목 ✓ 면 paid signup 가동 가능."
      : "Stripe / Toss env-var presence + dashboard action status. All ✓ = paid signup can be enabled.",
    overallOk: isKo ? "✓ 모든 항목 준비 완료" : "✓ All checks passing",
    overallWarning: isKo ? "⚠ 일부 항목 경고" : "⚠ Some warnings",
    overallMissing: isKo ? "✗ 미완료 항목 있음" : "✗ Missing items",
    groups: {
      stripe: isKo
        ? "Stripe (USD 결제) — 현재 보류 (Toss 단독 가동)"
        : "Stripe (USD) — deferred (Toss-only launch)",
      toss: isKo ? "Toss Payments (KRW 결제)" : "Toss Payments (KRW)",
      gate: isKo ? "Signup 활성 게이트" : "Signup activation gate",
    } as Record<string, string>,
    items: {
      "stripe.secret": isKo ? "Stripe Secret Key" : "Stripe Secret Key",
      "stripe.webhook": isKo ? "Stripe Webhook Secret" : "Stripe Webhook Secret",
      "stripe.price.starterMonthly": isKo ? "Starter 월간 Price ID" : "Starter monthly price ID",
      "stripe.price.starterAnnual": isKo ? "Starter 연간 Price ID" : "Starter annual price ID",
      "stripe.price.validatorMonthly": isKo
        ? "Validator 월간 Price ID"
        : "Validator monthly price ID",
      "stripe.price.validatorAnnual": isKo
        ? "Validator 연간 Price ID"
        : "Validator annual price ID",
      "stripe.price.growthMonthly": isKo ? "Growth 월간 Price ID" : "Growth monthly price ID",
      "stripe.price.growthAnnual": isKo ? "Growth 연간 Price ID" : "Growth annual price ID",
      "toss.secret": isKo ? "Toss Secret Key" : "Toss Secret Key",
      "toss.client": isKo
        ? "Toss Client Key (public — 브라우저 노출)"
        : "Toss Client Key (public — browser-exposed)",
      "toss.webhook": isKo ? "Toss Webhook Secret" : "Toss Webhook Secret",
      "gate.signup": isKo
        ? "NEXT_PUBLIC_SIGNUP_ENABLED=true"
        : "NEXT_PUBLIC_SIGNUP_ENABLED=true",
    } as Record<string, string>,
    checklistTitle: isKo
      ? "Dashboard 수동 액션 체크리스트"
      : "Manual dashboard checklist",
    checklist: {
      "checklist.stripeProducts": isKo
        ? "Stripe Dashboard → 3개 product 생성 (Starter / Validator / Growth)"
        : "Stripe Dashboard → create 3 products (Starter / Validator / Growth)",
      "checklist.stripePrices": isKo
        ? "각 product에 monthly + annual price 생성 (총 6개) → Price ID를 Vercel env 에 복사"
        : "Create monthly + annual price per product (6 total) → paste Price IDs into Vercel env",
      "checklist.stripeWebhook": isKo
        ? "Stripe Dashboard → Developers → Webhooks → endpoint `https://<your-domain>/api/billing/webhook` 등록, signing secret 을 STRIPE_WEBHOOK_SECRET 에 복사"
        : "Stripe Dashboard → Developers → Webhooks → add endpoint `https://<your-domain>/api/billing/webhook`, copy signing secret to STRIPE_WEBHOOK_SECRET",
      "checklist.tossMerchant": isKo
        ? "Toss Payments 가맹점 가입 완료 + 결제 모듈 → 빌링 키 발급"
        : "Complete Toss merchant onboarding + issue billing keys",
      "checklist.tossWebhook": isKo
        ? "Toss 콘솔 → 웹훅 URL 등록 `https://<your-domain>/api/billing/toss/webhook`, signing secret 을 TOSS_WEBHOOK_SECRET 에 복사"
        : "Toss console → register webhook `https://<your-domain>/api/billing/toss/webhook`, copy signing secret to TOSS_WEBHOOK_SECRET",
    } as Record<string, string>,
  };
}

interface WorkspaceMeta {
  id: string;
  name: string | null;
}

/**
 * Operator-facing billing dashboard. Renders three rollups:
 *   1. Workspace × month cost board (top spenders this month)
 *   2. Provider mix (where the spend went, by LLM)
 *   3. Last 30 days running total + sim count
 *
 * Cost data comes from `simulations.total_cost_cents` populated by the
 * runner at sim completion (migration 0016 + cost.ts pricing table).
 * Failed / cancelled / pre-migration sims show null cost and are
 * skipped in the rollups, so the totals here are "successful billable
 * sims only" — a reasonable definition for spend-in-the-real-world.
 */
export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const admin = createServiceClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const last30Start = new Date();
  last30Start.setDate(last30Start.getDate() - 30);
  last30Start.setHours(0, 0, 0, 0);
  // 12 month history window — pull from the 1st of (today - 12 months) so
  // every full prior month appears intact. Caller renders most recent first.
  const last12Start = new Date(monthStart);
  last12Start.setMonth(last12Start.getMonth() - 11);

  // Pull every billable sim row in the window — completed AND
  // cancelled/failed — because the runner now persists partial token
  // costs on the cancel/fail path. Splitting them in the rollup tells
  // the operator how much they're losing to abandoned runs (which
  // still cost real LLM dollars but produce no usable output).
  // Filter on started_at (set at runner entry) instead of completed_at
  // so cancelled/failed rows aren't excluded by a missing completed_at.
  const [{ data: thisMonthSims }, { data: last30Sims }, { data: last12Sims }, { data: workspaces }] =
    await Promise.all([
      admin
        .from("simulations")
        .select(
          "id, workspace_id, total_input_tokens, total_output_tokens, total_cost_cents, completed_at, started_at, status, model_provider",
        )
        .gte("started_at", monthStart.toISOString())
        .not("total_cost_cents", "is", null),
      admin
        .from("simulations")
        .select(
          "id, workspace_id, total_input_tokens, total_output_tokens, total_cost_cents, completed_at, started_at, status, model_provider",
        )
        .gte("started_at", last30Start.toISOString())
        .not("total_cost_cents", "is", null),
      // 12 month history — same shape; lighter projection would help if
      // volume grows past ~50k rows but for now mirror is fine.
      admin
        .from("simulations")
        .select(
          "id, workspace_id, total_input_tokens, total_output_tokens, total_cost_cents, completed_at, started_at, status, model_provider",
        )
        .gte("started_at", last12Start.toISOString())
        .not("total_cost_cents", "is", null),
      admin.from("workspaces").select("id, name"),
    ]);

  const monthRows = (thisMonthSims ?? []) as unknown as SimRow[];
  const recent30Rows = (last30Sims ?? []) as unknown as SimRow[];
  const last12Rows = (last12Sims ?? []) as unknown as SimRow[];
  const wsList = (workspaces ?? []) as WorkspaceMeta[];
  const wsName = (id: string | null) => {
    if (!id) return "?";
    return wsList.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  };

  const sum = (rows: SimRow[], key: keyof SimRow) =>
    rows.reduce((s, r) => s + ((r[key] as number | null) ?? 0), 0);

  // Split rollups by status so the wasted-spend slice is visible.
  // "completed" = useful spend (produced a result the user could use)
  // "cancelled" + "failed" = wasted spend (LLM tokens burned, no
  //                          usable output — typically user cancel
  //                          mid-run or pipeline exception).
  const isWasted = (s: string) => s === "cancelled" || s === "failed";
  const monthCompletedRows = monthRows.filter((r) => r.status === "completed");
  const monthWastedRows = monthRows.filter((r) => isWasted(r.status));

  const monthCompletedCents = sum(monthCompletedRows, "total_cost_cents");
  const monthWastedCents = sum(monthWastedRows, "total_cost_cents");
  const monthTotalCents = monthCompletedCents + monthWastedCents;
  const monthInputTokens = sum(monthRows, "total_input_tokens");
  const monthOutputTokens = sum(monthRows, "total_output_tokens");
  const monthCompletedSimCount = monthCompletedRows.length;
  const monthWastedSimCount = monthWastedRows.length;

  const recent30CompletedRows = recent30Rows.filter((r) => r.status === "completed");
  const recent30TotalCents = sum(recent30Rows, "total_cost_cents");
  const recent30CompletedCents = sum(recent30CompletedRows, "total_cost_cents");
  const recent30CompletedCount = recent30CompletedRows.length;
  // Avg / sim is computed against COMPLETED only — that's the useful
  // unit-cost benchmark for plan pricing math. Including cancelled
  // sims would dilute the average since cancelled rows often persist
  // far below the full per-sim cost.
  const recent30AvgCents =
    recent30CompletedCount > 0 ? Math.round(recent30CompletedCents / recent30CompletedCount) : 0;

  // Top-spending workspaces this month.
  const byWorkspace = new Map<string, { sims: number; cents: number; tokens: number }>();
  for (const r of monthRows) {
    const key = r.workspace_id ?? "?";
    const cur = byWorkspace.get(key) ?? { sims: 0, cents: 0, tokens: 0 };
    cur.sims += 1;
    cur.cents += r.total_cost_cents ?? 0;
    cur.tokens += (r.total_input_tokens ?? 0) + (r.total_output_tokens ?? 0);
    byWorkspace.set(key, cur);
  }
  const topSpenders = [...byWorkspace.entries()]
    .map(([wsId, v]) => ({ wsId, ...v }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 10);

  // ── 월별 사용 내역 (12개월) ──
  // Bucket by YYYY-MM string from started_at; split completed vs wasted
  // for the same "useful vs burned" framing as the headline KPI.
  type MonthlyBucket = {
    monthKey: string;
    completedSims: number;
    wastedSims: number;
    completedCents: number;
    wastedCents: number;
    tokens: number;
  };
  const monthlyMap = new Map<string, MonthlyBucket>();
  // Seed the last 12 months so empty months render as a row (instead of
  // collapsing the timeline — useful for spotting silent periods).
  for (let i = 0; i < 12; i++) {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, {
      monthKey: key,
      completedSims: 0,
      wastedSims: 0,
      completedCents: 0,
      wastedCents: 0,
      tokens: 0,
    });
  }
  for (const r of last12Rows) {
    if (!r.started_at) continue;
    const d = new Date(r.started_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    const cents = r.total_cost_cents ?? 0;
    const tokens = (r.total_input_tokens ?? 0) + (r.total_output_tokens ?? 0);
    bucket.tokens += tokens;
    if (r.status === "completed") {
      bucket.completedSims += 1;
      bucket.completedCents += cents;
    } else if (isWasted(r.status)) {
      bucket.wastedSims += 1;
      bucket.wastedCents += cents;
    }
  }
  const monthlyHistory = [...monthlyMap.values()].sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey),
  );
  // For bar visualisation — max total spend across the 12 months.
  const monthlyMaxCents = monthlyHistory.reduce(
    (max, m) => Math.max(max, m.completedCents + m.wastedCents),
    1,
  );

  // Provider mix this month.
  const byProvider = new Map<string, { sims: number; cents: number }>();
  for (const r of monthRows) {
    const key = r.model_provider ?? "unknown";
    const cur = byProvider.get(key) ?? { sims: 0, cents: 0 };
    cur.sims += 1;
    cur.cents += r.total_cost_cents ?? 0;
    byProvider.set(key, cur);
  }
  const providerMix = [...byProvider.entries()]
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.cents - a.cents);
  const providerMixMaxCents = providerMix[0]?.cents ?? 1;

  const readiness = getBillingReadiness();
  const readinessLabels = billingReadinessLabels(isKo);
  const overallBannerTone =
    readiness.overall === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : readiness.overall === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-900";
  const overallBannerLabel =
    readiness.overall === "ok"
      ? readinessLabels.overallOk
      : readiness.overall === "warning"
        ? readinessLabels.overallWarning
        : readinessLabels.overallMissing;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{isKo ? "비용 / 사용량" : "Billing & usage"}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isKo
            ? "완료·취소·실패 시뮬의 LLM 토큰 사용량과 비용을 집계합니다. 취소/실패 sim도 토큰은 이미 소비됐으므로 별도 집계해 \"낭비된 비용\" 으로 표시합니다."
            : "Token usage + cost across completed / cancelled / failed sims. Cancelled & failed sims still burned LLM tokens, surfaced separately as \"wasted spend\"."}
        </p>
      </div>

      {/* Billing activation readiness — env-var presence + manual checklist.
          Shown above the cost rollups so the operator sees blockers first. */}
      <details className={`card border ${overallBannerTone}`} open={readiness.overall !== "ok"}>
        <summary className="cursor-pointer flex items-center justify-between text-sm font-medium">
          <span>{readinessLabels.title}</span>
          <span className="text-xs">{overallBannerLabel}</span>
        </summary>
        <div className="mt-3 space-y-4 text-sm">
          <p className="text-xs opacity-80">{readinessLabels.subtitle}</p>
          {readiness.groups.map((group) => (
            <div key={group.titleKey} className="space-y-1">
              <div className="font-medium">
                {readinessLabels.groups[group.titleKey] ?? group.titleKey}
              </div>
              <div className="space-y-0.5 pl-1">
                {group.items.map((item) => {
                  const icon =
                    item.status === "ok" ? "✓" : item.status === "warning" ? "⚠" : "✗";
                  const colorClass =
                    item.status === "ok"
                      ? "text-emerald-700"
                      : item.status === "warning"
                        ? "text-amber-700"
                        : "text-rose-700";
                  const label = readinessLabels.items[item.key] ?? item.key;
                  return (
                    <div key={item.key} className="flex items-baseline gap-2 text-xs">
                      <span className={`font-mono ${colorClass}`}>{icon}</span>
                      <span className="text-slate-800">{label}</span>
                      {item.env && (
                        <code className="text-[10px] text-slate-500 font-mono">
                          {item.env}
                        </code>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {readiness.manualChecklistKeys.length > 0 && (
            <div className="pt-2 border-t border-current opacity-90">
              <div className="font-medium mb-1">{readinessLabels.checklistTitle}</div>
              <ul className="list-disc list-inside text-xs space-y-0.5 pl-1">
                {readiness.manualChecklistKeys.map((k) => (
                  <li key={k}>{readinessLabels.checklist[k] ?? k}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={isKo ? "이번 달 비용 (완료)" : "Completed spend (this month)"}
          value={formatCentsUsd(monthCompletedCents)}
          hint={isKo ? `${monthCompletedSimCount}개 시뮬` : `${monthCompletedSimCount} sims`}
        />
        <KpiCard
          label={isKo ? "이번 달 낭비된 비용" : "Wasted spend (this month)"}
          value={formatCentsUsd(monthWastedCents)}
          hint={
            isKo
              ? `${monthWastedSimCount}개 취소·실패 (전체 ${monthTotalCents > 0 ? Math.round((monthWastedCents / monthTotalCents) * 100) : 0}%)`
              : `${monthWastedSimCount} cancelled/failed (${monthTotalCents > 0 ? Math.round((monthWastedCents / monthTotalCents) * 100) : 0}% of total)`
          }
        />
        <KpiCard
          label={isKo ? "이번 달 토큰" : "Tokens this month"}
          value={`${((monthInputTokens + monthOutputTokens) / 1_000_000).toFixed(1)}M`}
          hint={`${(monthInputTokens / 1000).toFixed(0)}k in / ${(monthOutputTokens / 1000).toFixed(0)}k out`}
        />
        <KpiCard
          label={isKo ? "시뮬당 평균 (완료)" : "Avg cost / sim (completed)"}
          value={formatCentsUsd(recent30AvgCents)}
          hint={isKo ? `최근 30일 · ${recent30CompletedCount}개` : `Last 30 days · ${recent30CompletedCount} sims`}
        />
      </div>

      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">
            {isKo ? "이번 달 워크스페이스별 비용 (Top 10)" : "Top workspaces this month"}
          </h2>
        </div>
        {topSpenders.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            {isKo ? "이번 달 사용 데이터가 없습니다." : "No usage data yet this month."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">{isKo ? "워크스페이스" : "Workspace"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "시뮬 수" : "Sims"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "토큰" : "Tokens"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "누적 비용" : "Cost"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "시뮬당 평균" : "Avg / sim"}</th>
                </tr>
              </thead>
              <tbody>
                {topSpenders.map((w) => (
                  <tr key={w.wsId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-900">
                      <div className="font-medium">{wsName(w.wsId)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{w.wsId.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-700">{w.sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-600">
                      {(w.tokens / 1_000_000).toFixed(2)}M
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono text-slate-900 font-medium">
                      {formatCentsUsd(w.cents)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-500">
                      {formatCentsUsd(w.sims > 0 ? Math.round(w.cents / w.sims) : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">
            {isKo ? "이번 달 LLM별 비용 분포" : "Provider mix this month"}
          </h2>
        </div>
        {providerMix.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">—</div>
        ) : (
          <div className="px-6 py-4 space-y-3">
            {providerMix.map((p) => {
              const w = (p.cents / providerMixMaxCents) * 100;
              const share = monthTotalCents > 0 ? Math.round((p.cents / monthTotalCents) * 100) : 0;
              return (
                <div key={p.provider} className="flex items-center gap-3 text-sm">
                  <div className="w-24 font-medium text-slate-700 capitalize">{p.provider}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-32 text-right tabular-nums font-mono text-slate-900">
                    {formatCentsUsd(p.cents)}
                  </div>
                  <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                    {p.sims} sims · {share}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 월별 사용 내역 (12개월) — 가장 최근 달부터 표시. 빈 달도 행 유지해서
          silent 기간 식별 가능. completed/wasted 분리 + bar visualisation. */}
      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">
            {isKo ? "월별 사용 내역 (최근 12개월)" : "Monthly history (last 12 months)"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isKo
              ? "월 단위 완료·낭비 비용 + 시뮬 수 + 토큰. 가장 최근 달이 위에 표시됩니다."
              : "Per-month completed / wasted spend + sim count + tokens. Most recent month at top."}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{isKo ? "월" : "Month"}</th>
                <th className="text-right px-6 py-3 font-medium">{isKo ? "완료" : "Completed"}</th>
                <th className="text-right px-6 py-3 font-medium">{isKo ? "낭비" : "Wasted"}</th>
                <th className="text-right px-6 py-3 font-medium">{isKo ? "합계" : "Total"}</th>
                <th className="text-right px-6 py-3 font-medium">{isKo ? "시뮬" : "Sims"}</th>
                <th className="text-right px-6 py-3 font-medium">{isKo ? "토큰" : "Tokens"}</th>
                <th className="text-left px-6 py-3 font-medium" style={{ width: "30%" }}>
                  {isKo ? "비교" : "Trend"}
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyHistory.map((m) => {
                const total = m.completedCents + m.wastedCents;
                const totalSims = m.completedSims + m.wastedSims;
                const barTotalPct = (total / monthlyMaxCents) * 100;
                const completedShareOfBar =
                  total > 0 ? (m.completedCents / total) * barTotalPct : 0;
                const wastedShareOfBar = barTotalPct - completedShareOfBar;
                const isCurrentMonth =
                  m.monthKey ===
                  `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
                return (
                  <tr
                    key={m.monthKey}
                    className={`border-t border-slate-100 hover:bg-slate-50 ${
                      isCurrentMonth ? "bg-brand/5" : ""
                    }`}
                  >
                    <td className="px-6 py-3 text-slate-900 font-mono text-xs">
                      {m.monthKey}
                      {isCurrentMonth && (
                        <span className="ml-2 text-[10px] text-brand font-sans">
                          {isKo ? "(이번 달)" : "(current)"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono text-slate-900">
                      {formatCentsUsd(m.completedCents)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono text-slate-500">
                      {m.wastedCents > 0 ? formatCentsUsd(m.wastedCents) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono text-slate-900 font-medium">
                      {total > 0 ? formatCentsUsd(total) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                      {totalSims > 0 ? totalSims.toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-500 text-xs">
                      {m.tokens > 0 ? `${(m.tokens / 1_000_000).toFixed(2)}M` : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {total > 0 ? (
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-brand"
                            style={{ width: `${completedShareOfBar}%` }}
                          />
                          {wastedShareOfBar > 0 && (
                            <div
                              className="h-full bg-rose-300"
                              style={{ width: `${wastedShareOfBar}%` }}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="h-2 bg-slate-50 rounded-full" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 bg-brand rounded-sm" />
            {isKo ? "완료" : "Completed"}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 bg-rose-300 rounded-sm" />
            {isKo ? "낭비 (취소·실패)" : "Wasted (cancelled / failed)"}
          </span>
        </div>
      </div>
    </div>
  );
}
