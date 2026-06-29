import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { checkSystemHealth } from "@/lib/monitoring/system-health";
import { notifySystemHealthAlert } from "@/lib/email/billing-notify";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEDUP_WINDOW_HOURS = 18;

/**
 * GET /api/monitoring/cron
 *
 * 전 기능 헬스체크 후 warn/fail이 있으면 운영 담당자에게 이메일 알림.
 * 이번 크롤러 사고(13일간 조용히 죽음)처럼 "엔드포인트는 있는데 아무도 안
 * 보는" 공백을 메운다.
 *
 * - MRAI 게이트 없음: 코어(시뮬·결제·DB)까지 보므로 어느 배포에서 돌든 OK.
 * - 중복 방지: app/mrai 두 프로젝트가 같은 스케줄로 다 돌므로, audit_logs에
 *   system_health_alert 마커를 두고 DEDUP_WINDOW 안에 이미 보냈으면 skip.
 * - 정상이면 메일 없음(조용). 복구되면 자동으로 알림이 멎는다.
 *
 * 스케줄(vercel.json): 0 *​/6 * * * (6시간마다). 외부 다운 전체는 별도로
 * 공개 /api/health에 UptimeRobot을 걸어 커버.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  const health = await checkSystemHealth();

  // 전부 정상 → 알림 없음.
  if (health.failing.length === 0) {
    return NextResponse.json({ status: "ok", alerted: false, checks: health.checks });
  }

  const svc = createServiceClient();
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000).toISOString();
  const { data: recent } = await svc
    .from("audit_logs")
    .select("id")
    .eq("action", "system_health_alert")
    .gte("ts", since)
    .limit(1);

  const alreadyAlerted = !!(recent && recent.length);
  if (!alreadyAlerted) {
    void notifySystemHealthAlert({
      overallStatus: health.status,
      failing: health.failing.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
    });
    await svc.from("audit_logs").insert({
      action: "system_health_alert",
      metadata: {
        status: health.status,
        failing: health.failing.map((c) => ({ key: c.key, status: c.status, detail: c.detail })),
      },
    });
  }

  return NextResponse.json({
    status: health.status,
    healthy: health.healthy,
    alerted: !alreadyAlerted,
    deduped: alreadyAlerted,
    checks: health.checks,
  });
}
