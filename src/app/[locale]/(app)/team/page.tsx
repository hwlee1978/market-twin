import { getTranslations, setRequestLocale } from "next-intl/server";
import { Mail, Users as UsersIcon, Sparkles, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

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

  // Workspace + members in parallel.
  const supabase = await createClient();
  const [workspaceRes, membersRes] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, company_name, plan, created_at")
      .eq("id", ctx.workspaceId)
      .single(),
    supabase
      .from("workspace_members")
      .select("user_id, role, created_at")
      .eq("workspace_id", ctx.workspaceId),
  ]);
  const workspace = workspaceRes.data;
  const memberRows = (membersRes.data ?? []) as Array<{
    user_id: string;
    role: string;
    created_at: string;
  }>;

  // v0.1: a workspace has exactly one member, and it's the current user.
  // We already have their email from the auth context — no need for the
  // admin.listUsers round-trip (was costing ~500ms-1s per nav).
  // When v0.2 multi-member lands, this becomes a per-id lookup instead.
  const emailById = new Map<string, string>();
  emailById.set(ctx.userId, ctx.email);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {t("members.title")}
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {t("members.count", { n: memberRows.length })}
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {memberRows.map((m) => {
              const email = emailById.get(m.user_id) ?? m.user_id;
              const initial = email[0]?.toUpperCase() ?? "?";
              return (
                <li key={m.user_id} className="flex items-center gap-4 py-3.5">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-50 text-brand text-sm font-semibold shrink-0">
                    {initial}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {email}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t("members.joined", {
                        date: new Date(m.created_at).toLocaleDateString(locale),
                      })}
                    </div>
                  </div>
                  <span className="badge bg-brand-50 text-brand capitalize">
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg border border-dashed border-slate-200 p-5 bg-slate-50/40">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white text-slate-400 shrink-0">
                <Sparkles size={15} />
              </span>
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {t("inviteSoon.title")}
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {t("inviteSoon.description")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t("workspace.title")}
          </h2>
          <Field label={t("workspace.name")}>{workspace?.name ?? "—"}</Field>
          <Field label={t("workspace.companyName")}>
            {workspace?.company_name ?? "—"}
          </Field>
          <Field label={t("workspace.plan")}>
            <span className="badge bg-slate-100 text-slate-700 uppercase tracking-wider">
              {workspace?.plan ?? "starter"}
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
              <span>{t("benefits.singleMember")}</span>
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
