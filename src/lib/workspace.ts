import { cache } from "react";
import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  checkTrialAbuse,
  recordSignupAttempt,
  clientIp,
} from "@/lib/billing/trial-abuse";

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

    // Trial-abuse check before granting the free 1-sim trial.
    // Headers come from the Next request (Vercel populates
    // x-forwarded-for); we run the check best-effort and downgrade
    // the trial sim quota to 0 if the signup looks abusive. The
    // workspace itself is still created so the user can browse the
    // dashboard and see the upgrade prompt.
    let abuseGrant = true;
    let abuseReason: string | undefined;
    let emailCanonical = user.email ?? "";
    let emailDomain = "";
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = clientIp(h);
      const verdict = await checkTrialAbuse({ email: user.email ?? "", ip });
      abuseGrant = verdict.grant;
      abuseReason = verdict.reason;
      emailCanonical = verdict.emailCanonical;
      emailDomain = verdict.emailDomain;
    } catch (err) {
      // Header / DB hiccup — fail open so legitimate signups aren't blocked.
      console.warn(`[workspace] trial-abuse check failed, defaulting to grant:`, err);
    }

    // Bootstrap a free_trial subscription row alongside the workspace.
    // 7-day window + 1 free sim when allowed; trial_sims_limit=0 when
    // the abuse check denied. Failure is non-fatal — the migration's
    // backfill catches any orphan rows on the next deploy.
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: subErr } = await admin.from("subscriptions").insert({
      workspace_id: ws.id,
      plan: "free_trial",
      status: "trialing",
      trial_ends_at: trialEndsAt,
      trial_sims_limit: abuseGrant ? 1 : 0,
    });
    if (subErr && (subErr as { code?: string }).code !== "23505") {
      console.warn(`[workspace] subscription bootstrap failed for ${ws.id}:`, subErr.message);
    }

    // Audit trail — record every signup attempt (granted or denied)
    // so abuse-detection rates can be tuned from real data.
    try {
      await recordSignupAttempt({
        userId: user.id,
        workspaceId: ws.id,
        emailRaw: user.email ?? "",
        emailCanonical,
        emailDomain,
        ip,
        trialGranted: abuseGrant,
        denialReason: abuseReason,
      });
    } catch (err) {
      console.warn(`[workspace] signup-attempt logging failed:`, err);
    }

    return {
      workspaceId: ws.id,
      userId: user.id,
      email: user.email ?? "",
      status: "active",
    };
  },
);
