import { createServiceClient } from "@/lib/supabase/server";

/**
 * 크롤러 건강 상태 점검 — 외부 모니터(엔드포인트)와 알림 크론이 공유한다.
 *
 * 두 가지 고장을 잡는다:
 *  1) 신선도(staleness): 가장 최근 크롤이 너무 오래됨 → 크론이 안 돌거나
 *     게이트에 막혀 skip되는 상황(2026-06 사고). 마지막 크롤 시각이 임계
 *     시간을 넘으면 unhealthy.
 *  2) 실패 피드(failing): fail_count가 누적된 소스(예: URL 404). 개별 피드가
 *     죽었는데 방치되는 것을 잡는다.
 */

const STALE_THRESHOLD_HOURS = 30; // 일간 크론(24h) + 여유. 넘으면 "안 도는 중".
const FAIL_THRESHOLD = 3; // 연속 실패 누적 임계.

export interface CrawlHealth {
  healthy: boolean;
  enabledSources: number;
  lastCrawlAt: string | null;
  lastCrawlHoursAgo: number | null;
  stale: boolean;
  staleThresholdHours: number;
  failingSources: Array<{ label: string | null; url: string; failCount: number; lastError: string | null }>;
  checkedAt: string;
}

export async function checkCrawlHealth(): Promise<CrawlHealth> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("mrai_crawl_sources")
    .select("label, url, fetch_interval_hours, last_fetched_at, fail_count, last_error")
    .eq("enabled", true);

  const rows = (error ? [] : (data ?? [])) as Array<{
    label: string | null;
    url: string;
    fetch_interval_hours: number;
    last_fetched_at: string | null;
    fail_count: number | null;
    last_error: string | null;
  }>;

  const now = Date.now();
  const fetchedTimes = rows
    .map((r) => (r.last_fetched_at ? new Date(r.last_fetched_at).getTime() : 0))
    .filter((t) => t > 0);
  const lastCrawlMs = fetchedTimes.length ? Math.max(...fetchedTimes) : 0;
  const lastCrawlHoursAgo = lastCrawlMs ? (now - lastCrawlMs) / 3_600_000 : null;
  // 소스가 하나도 없으면 stale 판단 보류(설정 전 상태).
  const stale = rows.length > 0 && (lastCrawlHoursAgo == null || lastCrawlHoursAgo > STALE_THRESHOLD_HOURS);

  const failingSources = rows
    .filter((r) => (r.fail_count ?? 0) >= FAIL_THRESHOLD)
    .map((r) => ({ label: r.label, url: r.url, failCount: r.fail_count ?? 0, lastError: r.last_error }))
    .sort((a, b) => b.failCount - a.failCount);

  return {
    healthy: !stale && failingSources.length === 0,
    enabledSources: rows.length,
    lastCrawlAt: lastCrawlMs ? new Date(lastCrawlMs).toISOString() : null,
    lastCrawlHoursAgo: lastCrawlHoursAgo == null ? null : Math.round(lastCrawlHoursAgo * 10) / 10,
    stale,
    staleThresholdHours: STALE_THRESHOLD_HOURS,
    failingSources,
    checkedAt: new Date(now).toISOString(),
  };
}
