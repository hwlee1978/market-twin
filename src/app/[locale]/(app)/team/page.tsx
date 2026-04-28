import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function TeamPage({
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
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", ctx.workspaceId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.team")}</h1>
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Members ({members?.length ?? 0})
        </h3>
        <ul className="space-y-2 text-sm">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">{m.user_id.slice(0, 8)}…</span>
              <span className="badge bg-slate-100 text-slate-700">{m.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">Email invites arrive in v0.2.</p>
      </div>
    </div>
  );
}
