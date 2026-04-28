import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Returns the user's primary workspace, creating one on first login.
 * v0.1: every user gets exactly one workspace (their personal one) and is the owner.
 * Multi-workspace switching is deferred to v0.2.
 */
export async function getOrCreatePrimaryWorkspace(): Promise<{
  workspaceId: string;
  userId: string;
  email: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing?.workspace_id) {
    return { workspaceId: existing.workspace_id, userId: user.id, email: user.email ?? "" };
  }

  // Create workspace + membership using service role so RLS doesn't block the bootstrap.
  const admin = createServiceClient();
  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .insert({ name: user.email ?? "My Workspace", company_name: user.email ?? "" })
    .select("id")
    .single();
  if (wsErr || !ws) throw wsErr ?? new Error("Failed to create workspace");

  const { error: memErr } = await admin
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  if (memErr) throw memErr;

  return { workspaceId: ws.id, userId: user.id, email: user.email ?? "" };
}
