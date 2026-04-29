import { getTranslations, setRequestLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminAuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.audit");

  const admin = createServiceClient();
  const { data: logs } = await admin
    .from("audit_logs")
    .select("id, ts, actor_id, workspace_id, action, resource_type, resource_id, metadata")
    .order("ts", { ascending: false })
    .limit(200);

  type Log = {
    id: number;
    ts: string;
    actor_id: string | null;
    workspace_id: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown> | null;
  };

  const rows = (logs ?? []) as Log[];

  // Bulk-fetch actor emails so we can show humans, not UUIDs.
  const emailById = new Map<string, string>();
  if (rows.length > 0) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) {
      emailById.set(u.id, u.email ?? "");
    }
  }

  const actionTone = (action: string): "default" | "warn" | "risk" => {
    if (action.includes("suspend") || action.includes("cancel") || action.includes("delete"))
      return "risk";
    if (action.includes("retry") || action.includes("archive") || action.includes("change"))
      return "warn";
    return "default";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">{t("empty")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t("col.ts")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.actor")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.action")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.resource")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.workspace")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.metadata")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tone = actionTone(row.action);
                const toneCls =
                  tone === "risk"
                    ? "bg-risk-soft text-risk"
                    : tone === "warn"
                      ? "bg-warn-soft text-warn"
                      : "bg-slate-100 text-slate-700";
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(row.ts).toLocaleString(locale)}
                    </td>
                    <td className="px-6 py-3 text-xs">
                      <div className="text-slate-700 truncate max-w-[200px]">
                        {row.actor_id ? emailById.get(row.actor_id) ?? "" : "—"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {(row.actor_id ?? "").slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`badge ${toneCls}`}>{row.action}</span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600 font-mono whitespace-nowrap">
                      {row.resource_type ? `${row.resource_type}:` : ""}
                      {row.resource_id ? row.resource_id.slice(0, 8) : "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 font-mono">
                      {(row.workspace_id ?? "").slice(0, 8)}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 max-w-md">
                      {row.metadata ? (
                        <pre className="font-mono text-[11px] whitespace-pre-wrap break-words">
                          {JSON.stringify(row.metadata)}
                        </pre>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
