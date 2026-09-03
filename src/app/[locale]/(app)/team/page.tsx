import { getTranslations, setRequestLocale } from "next-intl/server";
import { Mail, Users as UsersIcon, ShieldCheck, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/dashboard/SectionTitle";
import { TeamManager } from "@/components/team/TeamManager";
import { createClient } from "@/lib/supabase/server";
import { getMyRoleInWorkspace, getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSeatUsage, listInvitations, listMembers, type Role } from "@/lib/team";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("team");
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const [workspaceRes, members, invitations, seats, myRole] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, company_name, created_at")
      .eq("id", ctx.workspaceId)
      .single(),
    listMembers(ctx.workspaceId, ctx.userId),
    listInvitations(ctx.workspaceId),
    getSeatUsage(ctx.workspaceId),
    getMyRoleInWorkspace(ctx.workspaceId),
  ]);
  const workspace = workspaceRes.data;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <SectionTitle
        icon={UsersIcon}
        gradient="linear-gradient(135deg,#7c3aed,#a855f7)"
        title={t("members.title")}
        note={t("members.count", { n: members.length })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TeamManager
            members={members}
            invitations={invitations}
            seats={{
              used: seats.used,
              limit: seats.limit,
              unlimited: seats.unlimited,
              remaining: seats.unlimited ? null : seats.remaining,
              planName: seats.planName,
            }}
            myRole={(myRole ?? "viewer") as Role}
          />
        </div>

        <div className="card space-y-4 self-start">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 bg-brand">
              <Building2 size={14} strokeWidth={2.4} />
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              {t("workspace.title")}
            </h2>
          </div>
          <Field label={t("workspace.name")}>{workspace?.name ?? "—"}</Field>
          <Field label={t("workspace.companyName")}>
            {workspace?.company_name ?? "—"}
          </Field>
          {/* subscriptions.plan, not workspaces.plan. The latter is a leftover
              column from migration 0001 that nothing in billing reads —
              entitlements, seat limits and simulation quotas all resolve
              through getSubscription(). Showing it here contradicted the seat
              meter directly above as soon as a workspace changed plan. */}
          <Field label={t("workspace.plan")}>
            <span className="badge bg-slate-100 text-slate-700 uppercase tracking-wider">
              {seats.planName}
            </span>
          </Field>
          <Field label={t("workspace.created")}>
            {workspace?.created_at
              ? new Date(workspace.created_at).toLocaleDateString(locale)
              : "—"}
          </Field>

          <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs text-slate-500">
            <div className="flex items-start gap-2">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
              <span>{t("benefits.rls")}</span>
            </div>
            <div className="flex items-start gap-2">
              <UsersIcon size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <span>{t("benefits.roles")}</span>
            </div>
            <div className="flex items-start gap-2">
              <Mail size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <span>{t("benefits.emailNotifications")}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}
