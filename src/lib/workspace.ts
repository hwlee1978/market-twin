import { createClient, createServiceClient } from "@/lib/supabase/server";

export type WorkspaceStatus = "active" | "suspended" | "archived";

type Result = {
  workspaceId: string;
  userId: string;
  email: string;
  status: WorkspaceStatus;
};

/**
 * Returns the user's primary workspace, creating one on first login.
 * v0.1: every user gets exactly one workspace (their personal one) and is the owner.
 *
 * Concurrency note: migration 0005 puts a unique index on
 * (user_id) where role='owner', so even if two parallel requests race past
 * the membership lookup and both try to insert, the DB rejects the second
 * one — we catch the unique-violation, look the row up again, and return
 * the winner. This stops the "4 phantom workspaces per user" bug we saw
 * before the index was added.
 */
export async function getOrCreatePrimaryWorkspace(): Promise<Result | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const found = await fetchExisting(user.id, user.email ?? "");
  if (found) return found;

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

  if (memErr) {
    // Postgres unique_violation = 23505. Means another request beat us to it
    // — clean up the orphan workspace we just created and return the winner.
    if ((memErr as { code?: string }).code === "23505") {
      await admin.from("workspaces").delete().eq("id", ws.id);
      const winner = await fetchExisting(user.id, user.email ?? "");
      if (winner) return winner;
    }
    throw memErr;
  }

  return {
    workspaceId: ws.id,
    userId: user.id,
    email: user.email ?? "",
    status: "active",
  };
}

async function fetchExisting(userId: string, email: string): Promise<Result | null> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(status)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!existing?.workspace_id) return null;

  const ws = existing.workspaces as { status?: string } | { status?: string }[] | null;
  const statusVal = Array.isArray(ws) ? ws[0]?.status : ws?.status;
  return {
    workspaceId: existing.workspace_id,
    userId,
    email,
    status: (statusVal ?? "active") as WorkspaceStatus,
  };
}
