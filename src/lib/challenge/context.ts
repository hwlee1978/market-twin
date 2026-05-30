import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

/**
 * 챌린지 응모/심사용 workspace context — 인증 사용자면 본인 workspace,
 * 비인증 (공개 접근) 이면 demo workspace fallback.
 *
 * Demo workspace ID는 env CHALLENGE_DEMO_WORKSPACE_ID로 지정. 미설정 시
 * null 반환 → 라우트는 unauthorized로 응답.
 *
 * 의도:
 *   - 심사위원이 가입 없이 평가 가능 (gating 0)
 *   - 일반 사용자가 자체 demo 시 같은 sandbox 공유 (격리는 v0.2)
 *   - 인증된 자체 사용자는 본인 workspace 유지
 *
 * 보안 trade-off (의도적):
 *   - Demo workspace 데이터는 isolation 없음 (모든 비인증 user 공유)
 *   - rate limiting 별도 (v0.2)
 *   - 응모서·심사용으로만 사용, 일반 SaaS 트래픽은 인증 강제
 */
export async function getChallengeWorkspaceId(): Promise<string | null> {
  // 1) 인증된 사용자면 본인 workspace 우선
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ctx = await getOrCreatePrimaryWorkspace();
      if (ctx) return ctx.workspaceId;
    }
  } catch {
    // fall through to demo
  }
  // 2) 비인증 → demo workspace (env로 지정)
  const demoId = process.env.CHALLENGE_DEMO_WORKSPACE_ID;
  if (demoId && /^[0-9a-f-]{36}$/i.test(demoId)) {
    return demoId;
  }
  return null;
}
