import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminSimulationsTable } from "@/components/admin/AdminSimulationsTable";
import { PageSizeSelect } from "@/components/admin/PageSizeSelect";
import { createServiceClient } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

export default async function AdminSimulationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.simulations");

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(10, parseInt(sp.pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  const admin = createServiceClient();
  // Pull recent simulations with the project name joined for display.
  // Returns total count alongside the page slice so the table can render
  // page navigation. Default page size 100; cap at 1000.
  const { data, count } = await admin
    .from("simulations")
    .select(
      "id, workspace_id, project_id, status, current_stage, persona_count, started_at, completed_at, error_message, model_provider, model_version, projects(name)",
      { count: "exact" },
    )
    .order("started_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  // Fold in the owning workspace's plan + owner email so the admin can tell
  // which rows are beta testers (plan === "free_trial") and who is running
  // them. Scoped to just the workspaces on this page slice.
  const wsIds = Array.from(
    new Set(
      ((data ?? []) as { workspace_id: string | null }[])
        .map((r) => r.workspace_id)
        .filter((v): v is string => !!v),
    ),
  );
  const [{ data: workspaces }, { data: members }, ownersRes] = await Promise.all([
    admin.from("workspaces").select("id, plan").in("id", wsIds),
    admin.from("workspace_members").select("workspace_id, user_id, role").in("workspace_id", wsIds),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);
  const planByWs = new Map<string, string>();
  for (const w of (workspaces ?? []) as { id: string; plan: string }[]) planByWs.set(w.id, w.plan);
  const ownerByWs = new Map<string, string>();
  for (const m of (members ?? []) as { workspace_id: string; user_id: string; role: string }[]) {
    if (m.role === "owner") ownerByWs.set(m.workspace_id, m.user_id);
  }
  const emailById = new Map<string, string>();
  for (const u of ownersRes.data?.users ?? []) emailById.set(u.id, u.email ?? "");

  type RawRow = {
    id: string;
    workspace_id: string | null;
    project_id: string;
    status: string;
    current_stage: string | null;
    persona_count: number | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    model_provider: string | null;
    model_version: string | null;
    projects: { name?: string } | { name?: string }[] | null;
  };

  const rows = ((data ?? []) as RawRow[]).map((r) => {
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    return {
      id: r.id,
      workspace_id: r.workspace_id,
      project_id: r.project_id,
      status: r.status,
      current_stage: r.current_stage,
      persona_count: r.persona_count,
      started_at: r.started_at,
      completed_at: r.completed_at,
      error_message: r.error_message,
      model_provider: r.model_provider,
      model_version: r.model_version,
      project_name: project?.name ?? null,
      plan: r.workspace_id ? planByWs.get(r.workspace_id) ?? null : null,
      owner_email: r.workspace_id
        ? emailById.get(ownerByWs.get(r.workspace_id) ?? "") ?? null
        : null,
    };
  });

  const totalRows = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>
      <AdminSimulationsTable rows={rows} locale={locale} />
      <SimulationsPager
        locale={locale}
        page={page}
        pageSize={pageSize}
        totalRows={totalRows}
        totalPages={totalPages}
      />
    </div>
  );
}

function SimulationsPager({
  locale,
  page,
  pageSize,
  totalRows,
  totalPages,
}: {
  locale: string;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}) {
  const base = `/${locale}/admin/simulations`;
  const buildHref = (p: number, s: number) => `${base}?page=${p}&pageSize=${s}`;
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalRows);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-1 py-2 text-sm text-slate-600">
      <div>
        {totalRows > 0
          ? `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} / ${totalRows.toLocaleString()} (페이지 ${page} / ${totalPages})`
          : "결과 없음"}
      </div>
      <div className="flex items-center gap-3">
        <PageSizeSelect baseHref={base} pageSize={pageSize} />
        <div className="flex items-center gap-1">
          <a
            href={isFirst ? "#" : buildHref(1, pageSize)}
            aria-disabled={isFirst}
            className={`rounded border px-2 py-1 text-xs ${isFirst ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            « 처음
          </a>
          <a
            href={isFirst ? "#" : buildHref(page - 1, pageSize)}
            aria-disabled={isFirst}
            className={`rounded border px-2 py-1 text-xs ${isFirst ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            ‹ 이전
          </a>
          <a
            href={isLast ? "#" : buildHref(page + 1, pageSize)}
            aria-disabled={isLast}
            className={`rounded border px-2 py-1 text-xs ${isLast ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            다음 ›
          </a>
          <a
            href={isLast ? "#" : buildHref(totalPages, pageSize)}
            aria-disabled={isLast}
            className={`rounded border px-2 py-1 text-xs ${isLast ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            끝 »
          </a>
        </div>
      </div>
    </div>
  );
}
