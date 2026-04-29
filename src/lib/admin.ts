import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AdminRole = "super" | "operations" | "customer" | "finance" | "ml_ops" | "support";

export interface AdminContext {
  userId: string;
  email: string;
  role: AdminRole;
}

/**
 * Returns the current user's admin context, or null if they're not in the admin_users table.
 * The check goes through service role because admin_users RLS only exposes the user's own row,
 * and we want a single trusted code path for "is this user admin?".
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient();
  const { data } = await admin
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { userId: user.id, email: user.email ?? "", role: data.role as AdminRole };
}

/** Role gate helpers used by the UI. Defaults are conservative — most actions require super. */
export const ADMIN_PERMISSIONS = {
  viewBilling: (role: AdminRole) => role === "super" || role === "finance",
  changePlan: (role: AdminRole) => role === "super" || role === "finance",
  impersonate: (role: AdminRole) => role === "super",
  retrySimulation: (role: AdminRole) =>
    role === "super" || role === "operations" || role === "ml_ops",
  cancelSimulation: (role: AdminRole) =>
    role === "super" || role === "operations" || role === "ml_ops",
  promoteModel: (role: AdminRole) => role === "super" || role === "ml_ops",
  suspendWorkspace: (role: AdminRole) => role === "super" || role === "operations",
};

/** Write a row to audit_logs. Always use service role for this — RLS is for tenant data. */
export async function recordAuditLog(opts: {
  actorId: string;
  workspaceId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("audit_logs").insert({
    actor_id: opts.actorId,
    workspace_id: opts.workspaceId ?? null,
    action: opts.action,
    resource_type: opts.resourceType ?? null,
    resource_id: opts.resourceId ?? null,
    metadata: opts.metadata ?? null,
  });
}
