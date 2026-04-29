import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminCustomersTable } from "@/components/admin/AdminCustomersTable";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminCustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.customers");

  const admin = createServiceClient();

  // Pull all workspaces with member info, then fold in per-workspace counts of
  // projects + simulations + most-recent-activity timestamp via parallel queries.
  // At <10k workspaces this is fine; once we scale, move to a SQL view.
  const [{ data: workspaces }, { data: members }, { data: projects }, { data: sims }] =
    await Promise.all([
      admin
        .from("workspaces")
        .select("id, name, company_name, industry, country, plan, status, created_at")
        .order("created_at", { ascending: false }),
      admin.from("workspace_members").select("workspace_id, user_id, role"),
      admin.from("projects").select("workspace_id"),
      admin.from("simulations").select("workspace_id, status, started_at, completed_at"),
    ]);

  // Look up owner emails via bulk auth.users listing. perPage caps at 1000;
  // for >1000 owners we'd paginate.
  const { data: ownersData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map<string, string>();
  for (const u of ownersData?.users ?? []) {
    emailById.set(u.id, u.email ?? "");
  }

  type WorkspaceRow = {
    id: string;
    name: string;
    company_name: string | null;
    industry: string | null;
    country: string | null;
    plan: string;
    status: "active" | "suspended" | "archived";
    created_at: string;
  };
  type MemberRow = { workspace_id: string; user_id: string; role: string };
  type ProjectRow = { workspace_id: string };
  type SimRow = {
    workspace_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
  };

  const memberRows = (members ?? []) as MemberRow[];
  const projectRows = (projects ?? []) as ProjectRow[];
  const simRows = (sims ?? []) as SimRow[];

  const rows = ((workspaces ?? []) as WorkspaceRow[]).map((ws) => {
    const owner = memberRows.find(
      (m) => m.workspace_id === ws.id && m.role === "owner",
    );
    const projectCount = projectRows.filter((p) => p.workspace_id === ws.id).length;
    const wsSims = simRows.filter((s) => s.workspace_id === ws.id);
    const completedSimCount = wsSims.filter((s) => s.status === "completed").length;
    const memberCount = memberRows.filter((m) => m.workspace_id === ws.id).length;
    const lastSim = wsSims
      .map((s) => s.completed_at ?? s.started_at)
      .filter((t): t is string => !!t)
      .sort()
      .pop();
    return {
      id: ws.id,
      name: ws.name,
      companyName: ws.company_name,
      country: ws.country,
      plan: ws.plan,
      status: ws.status,
      ownerEmail: owner ? emailById.get(owner.user_id) ?? "" : "",
      memberCount,
      projectCount,
      simCount: wsSims.length,
      completedSimCount,
      lastActivity: lastSim ?? null,
      createdAt: ws.created_at,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>
      <AdminCustomersTable rows={rows} locale={locale} />
    </div>
  );
}
