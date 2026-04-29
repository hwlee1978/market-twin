import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminSimulationsTable } from "@/components/admin/AdminSimulationsTable";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminSimulationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.simulations");

  const admin = createServiceClient();
  // Pull recent simulations with the project name joined for display.
  const { data } = await admin
    .from("simulations")
    .select(
      "id, workspace_id, project_id, status, current_stage, persona_count, started_at, completed_at, error_message, model_provider, model_version, projects(name)",
    )
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(100);

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
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>
      <AdminSimulationsTable rows={rows} locale={locale} />
    </div>
  );
}
