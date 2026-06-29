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
  for (const run of [checkDb, checkSimulations, checkCrawler, checkPayments]) {
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

/** DB 도달성 — 2초 내 select 1. */
async function checkDb(): Promise<HealthCheck> {
  const admin = createServiceClient();
  const started = Date.now();
  try {
    const q = admin.from("workspaces").select("id", { count: "exact", head: true }).limit(1);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("db_timeout(2s)")), 2000));
    await Promise.race([q, timeout]);
    return { key: "db", label: "데이터베이스", status: "ok", detail: `Supabase 정상 (${Date.now() - started}ms)` };
  } catch (err) {
    return { key: "db", label: "데이터베이스", status: "fail", detail: `도달 불가: ${err instanceof Error ? err.message : "unknown"}` };
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
