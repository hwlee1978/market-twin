import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeftCircle } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CustomerActions } from "@/components/admin/CustomerActions";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminCustomerDetailPage(props: {
  params: Promise<unknown>;
}) {
  const { id, locale } = (await props.params) as { id: string; locale: string };
  setRequestLocale(locale);
  const t = await getTranslations("admin.customers");
  const tProj = await getTranslations("project.status");

  const admin = createServiceClient();
  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, name, company_name, industry, country, plan, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!workspace) notFound();

  const [{ data: members }, { data: projects }, { data: sims }, { data: ownersData }] =
    await Promise.all([
      admin
        .from("workspace_members")
        .select("user_id, role, created_at")
        .eq("workspace_id", id),
      admin
        .from("projects")
        .select("id, name, product_name, status, candidate_countries, created_at, updated_at")
        .eq("workspace_id", id)
        .order("updated_at", { ascending: false })
        .limit(20),
      admin
        .from("simulations")
        .select(
          "id, status, current_stage, persona_count, started_at, completed_at, model_provider, project_id",
        )
        .eq("workspace_id", id)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(20),
      admin.auth.admin.listUsers({ perPage: 200 }),
    ]);

  const emailById = new Map<string, string>();
  for (const u of ownersData?.users ?? []) {
    emailById.set(u.id, u.email ?? "");
  }

  type Workspace = {
    id: string;
    name: string;
    company_name: string | null;
    industry: string | null;
    country: string | null;
    plan: string;
    status: "active" | "suspended" | "archived";
    created_at: string;
  };
  type MemberRow = { user_id: string; role: string; created_at: string };
  type ProjectRow = {
    id: string;
    name: string;
    product_name: string;
    status: string;
    candidate_countries: string[] | null;
    created_at: string;
    updated_at: string;
  };
  type SimRow = {
    id: string;
    status: string;
    current_stage: string | null;
    persona_count: number | null;
    started_at: string | null;
    completed_at: string | null;
    model_provider: string | null;
    project_id: string;
  };
  const ws = workspace as Workspace;
  const memberRows = (members ?? []) as MemberRow[];
  const projectRows = (projects ?? []) as ProjectRow[];
  const simRows = (sims ?? []) as SimRow[];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeftCircle size={13} />
          {t("backToList")}
        </Link>
        <div className="flex items-baseline justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold">{ws.name}</h1>
            {ws.company_name && ws.company_name !== ws.name && (
              <p className="text-sm text-slate-500 mt-1">{ws.company_name}</p>
            )}
          </div>
          <CustomerActions
            workspaceId={ws.id}
            currentStatus={ws.status}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={t("kpi.plan")} value={ws.plan.toUpperCase()} />
        <KpiCard
          label={t("kpi.status")}
          value={t(`status.${ws.status}` as "status.active")}
          tone={ws.status === "suspended" ? "risk" : ws.status === "archived" ? "warn" : "default"}
        />
        <KpiCard label={t("kpi.members")} value={memberRows.length} />
        <KpiCard label={t("kpi.projects")} value={projectRows.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            {t("section.profile")}
          </h3>
          <Field label={t("field.id")} mono>{ws.id}</Field>
          <Field label={t("field.industry")}>{ws.industry ?? "—"}</Field>
          <Field label={t("field.country")}>{ws.country ?? "—"}</Field>
          <Field label={t("field.created")}>
            {new Date(ws.created_at).toLocaleString(locale)}
          </Field>
        </div>

        <div className="card lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            {t("section.members")} ({memberRows.length})
          </h3>
          {memberRows.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {memberRows.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2 last:pb-0"
                >
                  <div>
                    <div className="text-slate-900">{emailById.get(m.user_id) ?? "—"}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {m.user_id.slice(0, 8)}
                    </div>
                  </div>
                  <span className="badge bg-slate-100 text-slate-700 capitalize">{m.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("section.noMembers")}</p>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold">
            {t("section.projects")} ({projectRows.length})
          </h3>
        </div>
        {projectRows.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-2 font-medium">{t("col.project")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.product")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.status")}</th>
                <th className="text-right px-6 py-2 font-medium">{t("col.countries")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-6 py-2">{p.name}</td>
                  <td className="px-6 py-2 text-slate-600">{p.product_name}</td>
                  <td className="px-6 py-2">
                    <StatusBadge
                      status={p.status}
                      label={tProj(p.status as "completed")}
                    />
                  </td>
                  <td className="px-6 py-2 text-right text-slate-600">
                    {(p.candidate_countries ?? []).length}
                  </td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {new Date(p.updated_at).toLocaleDateString(locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">
            {t("section.noProjects")}
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold">
            {t("section.simulations")} ({simRows.length})
          </h3>
        </div>
        {simRows.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-2 font-medium">ID</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.status")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.stage")}</th>
                <th className="text-right px-6 py-2 font-medium">{t("col.personas")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.model")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("col.started")}</th>
              </tr>
            </thead>
            <tbody>
              {simRows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-6 py-2 font-mono text-xs">{s.id.slice(0, 8)}</td>
                  <td className="px-6 py-2">
                    <StatusBadge status={s.status} label={tProj(s.status as "completed")} />
                  </td>
                  <td className="px-6 py-2 text-slate-600 text-xs">{s.current_stage ?? "—"}</td>
                  <td className="px-6 py-2 text-right text-slate-600">{s.persona_count ?? "—"}</td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {s.model_provider ?? "—"}
                  </td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {s.started_at ? new Date(s.started_at).toLocaleString(locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">
            {t("section.noSimulations")}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{children}</div>
    </div>
  );
}
