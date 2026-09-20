import { createServiceClient } from "@/lib/supabase/server";
import { checkCrawlHealth } from "@/lib/mrai/crawl/health";

/**
 * 전 기능 통합 헬스체크 — 조용히 죽는(silent failure) 서브시스템을 한 곳에서
 * 점검한다. /api/admin/health(조회)와 /api/monitoring/cron(이상 시 이메일)이
 * 공유. 체크는 추가만 하면 자동 반영되도록 배열로 관리.
 *
 * status 의미: ok=정상 / warn=주의(서비스 지속 가능하나 확인 필요) /
 * fail=고장(사용자 영향). overall.healthy = fail이 하나도 없음.
 */

export type CheckStatus = "ok" | "warn" | "fail";
export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
export interface SystemHealth {
  healthy: boolean; // fail이 0개
  status: CheckStatus; // 최악 상태
  checks: HealthCheck[];
  failing: HealthCheck[]; // warn+fail
  checkedAt: string;
}

const worst = (a: CheckStatus, b: CheckStatus): CheckStatus =>
  a === "fail" || b === "fail" ? "fail" : a === "warn" || b === "warn" ? "warn" : "ok";

export async function checkSystemHealth(): Promise<SystemHealth> {
  const checks: HealthCheck[] = [];
  for (const run of [
    checkDb,
    checkSimulations,
    checkCrawler,
    checkPayments,
    checkQualityAudit,
    checkFailoverRate,
    checkSilentDegradation,
  ]) {
    try {
      checks.push(await run());
    } catch (err) {
      checks.push({
        key: run.name,
        label: run.name,
        status: "fail",
        detail: `점검 자체 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  const status = checks.reduce<CheckStatus>((acc, c) => worst(acc, c.status), "ok");
  return {
    healthy: !checks.some((c) => c.status === "fail"),
    status,
    checks,
    failing: checks.filter((c) => c.status !== "ok"),
    checkedAt: new Date().toISOString(),
  };
}

// ── 개별 체크 ────────────────────────────────────────────────────────────────

/**
 * DB 도달성.
 *
 * 원래는 PostgREST 왕복을 2초와 race 시켰는데, 그 예산이 너무 빡빡해서
 * 오탐을 냈다. 근거: 알림이 나간 두 번 모두 이 체크만 fail이었고, 바로
 * 아래 세 체크가 같은 요청에서 같은 DB를 성공적으로 조회했다. DB가 진짜
 * 도달 불가였다면 셋 다 같이 죽었어야 한다. 둘 다 18:00 UTC 정각 —
 * monitoring·seo·auto-publish·zombie-cleanup 크론이 app/mrai 두 프로젝트에서
 * 동시에 뜨는 시각이라, 콜드 람다의 TLS+쿼리가 2초를 넘긴 것으로 본다.
 *
 * 그래서 예산을 늘리고 1회 재시도를 둔다. 1차만 늦고 2차가 붙으면 fail이
 * 아니라 warn — 사람을 깨우지 않되 느려진 사실은 남긴다. 오탐이 반복되면
 * 진짜 장애 메일까지 무시하게 되는 쪽이 더 큰 위험이다.
 *
 * abortSignal을 쓰는 이유: Promise.race는 진 쪽 쿼리를 취소하지 않고 버려서,
 * 매 점검마다 커넥션을 붙잡은 요청이 하나씩 남는다.
 */
const DB_BUDGET_MS = 5000;

async function pingDb(budgetMs: number): Promise<number> {
  const admin = createServiceClient();
  const started = Date.now();
  const { error } = await admin
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .limit(1)
    .abortSignal(AbortSignal.timeout(budgetMs));
  if (error) throw new Error(error.message);
  return Date.now() - started;
}

async function checkDb(): Promise<HealthCheck> {
  try {
    const ms = await pingDb(DB_BUDGET_MS);
    return { key: "db", label: "데이터베이스", status: "ok", detail: `Supabase 정상 (${ms}ms)` };
  } catch (first) {
    const firstMsg = first instanceof Error ? first.message : "unknown";
    try {
      const ms = await pingDb(DB_BUDGET_MS);
      return {
        key: "db",
        label: "데이터베이스",
        status: "warn",
        detail: `1차 실패 후 재시도 성공 (${ms}ms) — 원인: ${firstMsg}`,
      };
    } catch (second) {
      const secondMsg = second instanceof Error ? second.message : "unknown";
      return {
        key: "db",
        label: "데이터베이스",
        status: "fail",
        detail: `도달 불가 (${DB_BUDGET_MS}ms 예산, 2회 시도): ${secondMsg}`,
      };
    }
  }
}

/** 시뮬레이션 — 24h 성공률 + 좀비(20분+ running). */
async function checkSimulations(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const zombieBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("simulations")
    .select("status, started_at")
    .gte("created_at", since);
  if (error) return { key: "simulations", label: "시뮬레이션", status: "warn", detail: `조회 실패: ${error.message}` };
  const rows = (data ?? []) as Array<{ status: string; started_at: string | null }>;
  const done = rows.filter((r) => r.status === "completed").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const total = done + failed;
  const zombies = rows.filter((r) => r.status === "running" && r.started_at && r.started_at < zombieBefore).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : null;
  if (zombies > 0) return { key: "simulations", label: "시뮬레이션", status: "fail", detail: `좀비 ${zombies}건(20분+ running, cron 미작동 의심) · 24h 성공률 ${rate ?? "-"}%` };
  if (rate != null && total >= 3 && rate < 50) return { key: "simulations", label: "시뮬레이션", status: "fail", detail: `24h 성공률 ${rate}% (${done}/${total}) — 비정상` };
  return { key: "simulations", label: "시뮬레이션", status: "ok", detail: total > 0 ? `24h 성공률 ${rate}% (${done}/${total}), 좀비 0` : "최근 24h 시뮬 없음" };
}

/** 크롤러 — 신선도(크론 멈춤) + 실패 피드. */
async function checkCrawler(): Promise<HealthCheck> {
  const h = await checkCrawlHealth();
  if (h.stale) return { key: "crawler", label: "크롤러", status: "fail", detail: `마지막 크롤 ${h.lastCrawlHoursAgo ?? "?"}h 전 (임계 ${h.staleThresholdHours}h) — 크론 멈춤/게이트 의심` };
  if (h.failingSources.length > 0) {
    const top = h.failingSources.slice(0, 3).map((s) => `${s.label ?? s.url}(${s.failCount}회)`).join(", ");
    return { key: "crawler", label: "크롤러", status: "warn", detail: `실패 피드 ${h.failingSources.length}개: ${top}` };
  }
  return { key: "crawler", label: "크롤러", status: "ok", detail: `${h.enabledSources}개 소스 정상 · 마지막 ${h.lastCrawlHoursAgo ?? "?"}h 전` };
}

/** 결제 — 24h 결제실패 + past_due 구독. (warn 수준) */
async function checkPayments(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [pf, pd] = await Promise.all([
    admin.from("subscription_events").select("id", { count: "exact", head: true }).eq("event", "payment_failed").gte("created_at", since),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
  ]);
  const failed = pf.count ?? 0;
  const pastDue = pd.count ?? 0;
  if (failed > 0 || pastDue > 0) return { key: "payments", label: "결제", status: "warn", detail: `24h 결제실패 ${failed}건 · past_due ${pastDue}건` };
  return { key: "payments", label: "결제", status: "ok", detail: "결제실패 0 · past_due 0" };
}

/**
 * Quality audit coverage.
 *
 * Every completed sim should leave a simulation_quality row. The audit
 * is wrapped in a try/catch that only warns, so when it breaks the rows
 * simply stop appearing — and because the ensemble aggregator uses
 * those rows to decide which sims to quarantine, a broken audit quietly
 * lets flagged sims back into the conclusion. It is a cascade point, so
 * it is worth checking directly rather than waiting for a symptom.
 */
async function checkQualityAudit(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [sims, audits] = await Promise.all([
    admin
      .from("simulations")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("created_at", since),
    admin
      .from("simulation_quality")
      .select("simulation_id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);
  const done = sims.count ?? 0;
  const audited = audits.count ?? 0;
  if (done === 0) {
    return { key: "quality_audit", label: "품질 감사", status: "ok", detail: "최근 24h 완료 시뮬 없음" };
  }
  const pct = Math.round((audited / done) * 100);
  if (pct < 50) {
    return {
      key: "quality_audit",
      label: "품질 감사",
      status: "fail",
      detail: `완료 시뮬 ${done}건 중 ${audited}건만 감사됨 (${pct}%) — 격리 필터가 무력화됩니다`,
    };
  }
  if (pct < 90) {
    return {
      key: "quality_audit",
      label: "품질 감사",
      status: "warn",
      detail: `감사 누락 ${done - audited}건 (${pct}% 커버)`,
    };
  }
  return { key: "quality_audit", label: "품질 감사", status: "ok", detail: `${audited}/${done}건 감사 (${pct}%)` };
}

/**
 * Synthesis failover rate.
 *
 * One failover is the mechanism working. A high rate means the primary
 * provider is effectively down and every report is being written by the
 * backup — which is a different model than the tier advertises. Rate,
 * not count, because a per-event alert here would be pure noise.
 */
async function checkFailoverRate(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("simulation_quality")
    .select("synthesis_failover")
    .gte("created_at", since);
  if (error) {
    return { key: "failover", label: "LLM 폴오버", status: "warn", detail: `조회 실패: ${error.message}` };
  }
  const rows = (data ?? []) as Array<{ synthesis_failover: boolean | null }>;
  if (rows.length < 5) {
    return { key: "failover", label: "LLM 폴오버", status: "ok", detail: `표본 부족 (${rows.length}건)` };
  }
  const flipped = rows.filter((r) => r.synthesis_failover).length;
  const pct = Math.round((flipped / rows.length) * 100);
  if (pct >= 50) {
    return {
      key: "failover",
      label: "LLM 폴오버",
      status: "fail",
      detail: `24h 폴오버율 ${pct}% (${flipped}/${rows.length}) — 주 provider 사실상 중단`,
    };
  }
  if (pct >= 20) {
    return {
      key: "failover",
      label: "LLM 폴오버",
      status: "warn",
      detail: `24h 폴오버율 ${pct}% (${flipped}/${rows.length})`,
    };
  }
  return { key: "failover", label: "LLM 폴오버", status: "ok", detail: `24h 폴오버율 ${pct}%` };
}

/**
 * Digest of the silent degradations alertOps recorded.
 *
 * Individual alerts are collapsed per (kind, subject) and an email can
 * be missed. The audit trail is not — so the periodic health check
 * reports what actually happened, grouped, whether or not each one got
 * its own email.
 */
async function checkSilentDegradation(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("audit_logs")
    .select("resource_type, metadata")
    .eq("action", "ops_alert")
    .gte("ts", since);
  if (error) {
    return { key: "degradation", label: "품질 저하 신호", status: "warn", detail: `조회 실패: ${error.message}` };
  }
  const rows = (data ?? []) as Array<{ resource_type: string | null; metadata: { severity?: string } | null }>;
  if (rows.length === 0) {
    return { key: "degradation", label: "품질 저하 신호", status: "ok", detail: "24h 내 감지 없음" };
  }
  const byKind = new Map<string, number>();
  for (const r of rows) {
    const k = r.resource_type ?? "unknown";
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const summary = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}건`)
    .join(", ");
  const critical = rows.filter((r) => r.metadata?.severity === "critical").length;
  return {
    key: "degradation",
    label: "품질 저하 신호",
    status: critical > 0 ? "fail" : "warn",
    detail: `24h ${rows.length}건 (치명 ${critical}건) — ${summary}`,
  };
}
