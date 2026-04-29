import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";
import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "id, name, company_name, industry, country, plan, email_notifications, created_at",
    )
    .eq("id", ctx.workspaceId)
    .single();

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="space-y-6">
        <section className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            {t("profile.title")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <ReadField label={t("profile.email")} value={ctx.email} mono />
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">
                {t("profile.language")}
              </label>
              <div className="mt-2">
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            {t("workspace.title")}
          </h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            {t("workspace.subtitle")}
          </p>
          {workspace && (
            <WorkspaceSettingsForm
              workspaceId={workspace.id}
              initial={{
                name: workspace.name ?? "",
                companyName: workspace.company_name ?? "",
                industry: workspace.industry ?? "",
                country: workspace.country ?? "",
              }}
            />
          )}
          <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-5">
            <ReadField
              label={t("workspace.plan")}
              value={(workspace?.plan ?? "starter").toUpperCase()}
            />
            <ReadField
              label={t("workspace.created")}
              value={
                workspace?.created_at
                  ? new Date(workspace.created_at).toLocaleDateString(locale)
                  : "—"
              }
            />
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            {t("notifications.title")}
          </h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            {t("notifications.subtitle")}
          </p>
          {workspace && (
            <NotificationsToggle
              workspaceId={workspace.id}
              initial={workspace.email_notifications ?? true}
            />
          )}
        </section>

        <section className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            {t("session.title")}
          </h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            {t("session.subtitle")}
          </p>
          <SignOutButton />
        </section>
      </div>
    </>
  );
}

function ReadField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1.5 text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}
