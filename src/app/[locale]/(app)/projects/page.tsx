import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import { DemoCard } from "@/components/onboarding/DemoCard";
import { ProjectsTable } from "@/components/ProjectsTable";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, product_name, category, status, candidate_countries, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  const hasProjects = !!projects && projects.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("nav.projects")}</h1>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          {t("dashboard.newProject")}
        </Link>
      </div>

      {hasProjects ? (
        <ProjectsTable projects={projects} locale={locale} />
      ) : (
        <DemoCard />
      )}
    </div>
  );
}
