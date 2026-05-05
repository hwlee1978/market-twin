import { cache } from "react";
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
 * Wrapped in React's `cache()` so a single request dedupes the lookup across
 * layout + page server components — without this, every navigation hits the
 * DB twice (once in (app)/layout.tsx, once in the page itself). The cache is
 * scoped per-request so subsequent requests still see fresh state.
 *
 * Concurrency note: migration 0005 puts a unique index on
 * (user_id) where role='owner', so even if two parallel requests race past
 * the membership lookup and both try to insert, the DB rejects the second
 * one — we catch the unique-violation, look the row up again, and return
 * the winner. This stops the "4 phantom workspaces per user" bug we saw
 * before the index was added.
 */
export const getOrCreatePrimaryWorkspace = cache(
  async (): Promise<Result | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Inline membership lookup so we don't pay the createClient() cost twice.
    const { data: existing } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(status)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existing?.workspace_id) {
      const ws = existing.workspaces as
        | { status?: string }
        | { status?: string }[]
        | null;
      const statusVal = Array.isArray(ws) ? ws[0]?.status : ws?.status;
      return {
        workspaceId: existing.workspace_id,
        userId: user.id,
        email: user.email ?? "",
        status: (statusVal ?? "active") as WorkspaceStatus,
      };
    }

    // First-login bootstrap path.
    const admin = createServiceClient();
    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({
        name: user.email ?? "My Workspace",
        company_name: user.email ?? "",
      })
      .select("id")
      .single();
    if (wsErr || !ws) throw wsErr ?? new Error("Failed to create workspace");

    const { error: memErr } = await admin
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });

    if (memErr) {
      // 23505 = unique_violation. Another request beat us to the membership
      // insert — clean up our orphan workspace and return the winner.
      if ((memErr as { code?: string }).code === "23505") {
        await admin.from("workspaces").delete().eq("id", ws.id);
        const { data: winner } = await supabase
          .from("workspace_members")
          .select("workspace_id, workspaces(status)")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (winner?.workspace_id) {
          const wsW = winner.workspaces as
            | { status?: string }
            | { status?: string }[]
            | null;
          const statusVal = Array.isArray(wsW) ? wsW[0]?.status : wsW?.status;
          return {
            workspaceId: winner.workspace_id,
            userId: user.id,
            email: user.email ?? "",
            status: (statusVal ?? "active") as WorkspaceStatus,
          };
        }
      }
      throw memErr;
    }

    // Bootstrap a free_trial subscription row alongside the workspace.
    // 7-day window + 1 free sim, whichever comes first. Failure is
    // non-fatal — the migration's backfill catches any orphan rows on
    // the next deploy and the billing dashboard tolerates a missing
    // subscription by treating it as free_trial defaults.
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: subErr } = await admin.from("subscriptions").insert({
      workspace_id: ws.id,
      plan: "free_trial",
      status: "trialing",
      trial_ends_at: trialEndsAt,
      trial_sims_limit: 1,
    });
    if (subErr && (subErr as { code?: string }).code !== "23505") {
      console.warn(`[workspace] subscription bootstrap failed for ${ws.id}:`, subErr.message);
    }

    return {
      workspaceId: ws.id,
      userId: user.id,
      email: user.email ?? "",
      status: "active",
    };
  },
);
