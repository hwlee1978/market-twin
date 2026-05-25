import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSuperAdmin, SuperAdminAuthError } from "@/lib/auth/super-admin";
import { createServiceClient } from "@/lib/supabase/server";
import { LLMUsageDashboard } from "@/components/admin/LLMUsageDashboard";

export const dynamic = "force-dynamic";

/**
 * Super-admin LLM usage dashboard. Visible to anyone in the sidebar
 * (intentional — discovery for new operators) but page enforces
 * SUPERADMIN_EMAILS env match before rendering. Failure renders a
 * gate notice; success loads the four views (ranking / time-series /
 * provider mix / stage mix) from public.llm_usage_log via service
 * client.
 */
export default async function LLMUsagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  let adminEmail: string;
  try {
    adminEmail = await requireSuperAdmin();
  } catch (e) {
    const code = e instanceof SuperAdminAuthError ? e.code : "unknown";
    return (
      <div className="px-6 pt-6 pb-10 max-w-3xl mx-auto">
        <PageHeader title="LLM 사용량 (제한 구역)" subtitle="슈퍼 어드민 전용 페이지" />
        <div className="card border border-warn/40 bg-warn-soft/20 p-6 mt-4">
          <h2 className="text-base font-semibold text-warn mb-2">
            ⚠ 접근 권한 없음
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            {code === "not_authenticated"
              ? "먼저 로그인하세요."
              : code === "no_admins_configured"
                ? "SUPERADMIN_EMAILS 환경변수가 설정되지 않았습니다. 운영자에게 문의하세요."
                : "이 페이지는 슈퍼 어드민만 접근 가능합니다. SUPERADMIN_EMAILS env에 본인 이메일을 추가하려면 운영자에게 문의하세요."}
          </p>
        </div>
      </div>
    );
  }

  const admin = createServiceClient();

  // Last 60 days — enough window to spot weekly patterns without
  // pulling years of data. Time-series chart aggregates by day.
  const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  type RawRow = {
    workspace_id: string;
    provider: string;
    model: string;
    stage: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    created_at: string;
  };

  const { data: rowsRaw, error: rowsErr } = await admin
    .from("llm_usage_log")
    .select("workspace_id, provider, model, stage, input_tokens, output_tokens, cost_usd, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50000);
  if (rowsErr) {
    return (
      <div className="px-6 pt-6 pb-10 max-w-3xl mx-auto">
        <PageHeader title="LLM 사용량" subtitle="DB 로드 실패" />
        <pre className="card p-4 mt-4 text-xs text-risk">{rowsErr.message}</pre>
      </div>
    );
  }
  const rows = (rowsRaw ?? []) as RawRow[];

  // Hydrate workspace name for the ranking table. Owner email comes
  // from auth.users joined via workspace_members (owner role). Bulk-
  // load only the workspace ids present in the log.
  const workspaceIds = Array.from(new Set(rows.map((r) => r.workspace_id)));
  const safeIds = workspaceIds.length > 0 ? workspaceIds : ["00000000-0000-0000-0000-000000000000"];
  const { data: wsRaw } = await admin
    .from("workspaces")
    .select("id, name")
    .in("id", safeIds);
  type WsRow = { id: string; name: string | null };
  const wsRows = (wsRaw ?? []) as WsRow[];
  const wsLookup = new Map<string, { name: string; ownerEmail: string }>();
  for (const w of wsRows) {
    wsLookup.set(w.id, { name: w.name ?? w.id.slice(0, 8), ownerEmail: "" });
  }
  // Best-effort owner email join via workspace_members (role=owner)
  // + auth.users. Silently skip on failure — owner email is nice-to-
  // have, not required for the dashboard.
  try {
    const { data: memRaw } = await admin
      .from("workspace_members")
      .select("workspace_id, user_id, role")
      .eq("role", "owner")
      .in("workspace_id", safeIds);
    type MemRow = { workspace_id: string; user_id: string; role: string };
    const mems = (memRaw ?? []) as MemRow[];
    if (mems.length > 0) {
      const userIds = Array.from(new Set(mems.map((m) => m.user_id)));
      const { data: usersRes } = await admin.auth.admin.listUsers();
      const userEmail = new Map<string, string>();
      for (const u of usersRes?.users ?? []) {
        if (u.id && u.email && userIds.includes(u.id)) {
          userEmail.set(u.id, u.email);
        }
      }
      for (const m of mems) {
        const cur = wsLookup.get(m.workspace_id);
        if (cur) {
          cur.ownerEmail = userEmail.get(m.user_id) ?? "";
        }
      }
    }
  } catch {
    // owner email lookup is best-effort; ignore failures
  }

  // Aggregate into the four views client-side. Sending all rows to the
  // client means each chart can re-bucket / filter without re-fetching;
  // 50k row cap keeps the payload reasonable for v0.1 ops scale.
  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="LLM 사용량"
        subtitle={`최근 60일 · ${rows.length.toLocaleString()}개 호출 · 슈퍼 어드민: ${adminEmail}`}
      />
      <LLMUsageDashboard
        rows={rows.map((r) => ({
          workspaceId: r.workspace_id,
          workspaceName: wsLookup.get(r.workspace_id)?.name ?? r.workspace_id.slice(0, 8),
          ownerEmail: wsLookup.get(r.workspace_id)?.ownerEmail ?? "",
          provider: r.provider,
          model: r.model,
          stage: r.stage,
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          costUsd: Number(r.cost_usd),
          createdAt: r.created_at,
        }))}
      />
    </div>
  );
}
