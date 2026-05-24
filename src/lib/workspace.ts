import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  checkTrialAbuse,
  recordSignupAttempt,
  clientIp,
} from "@/lib/billing/trial-abuse";

export type WorkspaceStatus = "active" | "suspended" | "archived";
export const ACTIVE_WORKSPACE_COOKIE = "aw_id";

type Result = {
  workspaceId: string;
  userId: string;
  email: string;
  status: WorkspaceStatus;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  companyName: string | null;
  role: "owner" | "admin" | "analyst" | "viewer";
  status: WorkspaceStatus;
  isActive: boolean;
  createdAt: string;
};

/**
 * Returns the user's active workspace, creating one on first login.
 *
 * v0.2: a user can own/belong to multiple workspaces (Le Mouton + portfolio
 * companies). The "active" workspace is selected by the `aw_id` cookie set
 * by /api/workspaces/switch. If the cookie is missing/stale (e.g. user was
 * removed from that workspace), we fall back to the oldest membership.
 *
 * Migration 0038 dropped the unique-owner index from 0005, so concurrent
 * bootstrap inserts no longer collide on that path — but the trial-abuse
 * guard still keeps a single auto-bootstrapped workspace per user on first
 * login; subsequent workspaces are created explicitly via /api/workspaces.
 *
 * Wrapped in React's `cache()` so layout + page server components share one
 * lookup per request.
 */
export const getOrCreatePrimaryWorkspace = cache(
  async (): Promise<Result | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const memberships = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(status, created_at)")
      .eq("user_id", user.id);

    const rows = memberships.data ?? [];

    if (rows.length > 0) {
      // Honor cookie if it points to a real membership; otherwise pick the
      // oldest workspace (deterministic fallback so users don't get bounced
      // between workspaces between requests).
      const cookieStore = await cookies();
      const desired = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
      const chosen =
        rows.find((r) => r.workspace_id === desired) ??
        [...rows].sort((a, b) => {
          const aTs = pickCreatedAt(a.workspaces);
          const bTs = pickCreatedAt(b.workspaces);
          return aTs.localeCompare(bTs);
        })[0];

      const statusVal = pickStatus(chosen.workspaces);
      return {
        workspaceId: chosen.workspace_id,
        userId: user.id,
        email: user.email ?? "",
        status: (statusVal ?? "active") as WorkspaceStatus,
      };
    }

    // First-login bootstrap path (same as v0.1).
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
      // PK collision on (workspace_id, user_id) shouldn't fire — we just
      // created the workspace. Still, fail safe: orphan-clean and recurse.
      if ((memErr as { code?: string }).code === "23505") {
        await admin.from("workspaces").delete().eq("id", ws.id);
        return getOrCreatePrimaryWorkspace();
      }
      throw memErr;
    }

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
      console.warn(`[workspace] trial-abuse check failed, defaulting to grant:`, err);
    }

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

/**
 * List every workspace the current user is a member of, with the active
 * one flagged based on the cookie. Used by WorkspaceSwitcher.
 */
export async function listMyWorkspaces(): Promise<WorkspaceSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, company_name, status, created_at)")
    .eq("user_id", user.id);

  if (error || !data) return [];

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const items = data
    .map((row) => {
      const ws = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
      if (!ws) return null;
      return {
        id: ws.id as string,
        name: (ws.name as string) ?? "",
        companyName: (ws.company_name as string | null) ?? null,
        role: row.role as WorkspaceSummary["role"],
        status: ((ws.status as string) ?? "active") as WorkspaceStatus,
        isActive: false,
        createdAt: (ws.created_at as string) ?? "",
      };
    })
    .filter((x): x is WorkspaceSummary => Boolean(x))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // If cookie missing, the oldest workspace is implicitly active (matches
  // getOrCreatePrimaryWorkspace fallback).
  const effectiveActive = activeId ?? items[0]?.id;
  return items.map((w) => ({ ...w, isActive: w.id === effectiveActive }));
}

/**
 * Creates a new workspace and makes the caller its owner. Sets the active
 * cookie so the next navigation lands on the new workspace.
 */
export async function createWorkspaceForCurrentUser(input: {
  name: string;
  companyName?: string;
  industry?: string;
  country?: string;
}): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const name = input.name.trim();
  if (!name) return { error: "name_required" };

  const admin = createServiceClient();
  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .insert({
      name,
      company_name: input.companyName?.trim() || name,
      industry: input.industry?.trim() || null,
      country: input.country?.trim() || null,
    })
    .select("id")
    .single();
  if (wsErr || !ws) return { error: wsErr?.message ?? "insert_failed" };

  const { error: memErr } = await admin
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  if (memErr) {
    await admin.from("workspaces").delete().eq("id", ws.id);
    return { error: memErr.message };
  }

  // Bootstrap a starter subscription so plan-gated UI doesn't crash. New
  // workspaces beyond the first don't get a free trial — trial abuse guard
  // already approved this user on their first workspace.
  await admin.from("subscriptions").insert({
    workspace_id: ws.id,
    plan: "starter",
    status: "active",
  });

  return { workspaceId: ws.id };
}

/**
 * Verifies the caller is a member of `workspaceId`. Returns the role on
 * success or null on failure. Used by the switch endpoint before setting
 * the cookie so we don't honor a forged workspace id.
 */
export async function getMyRoleInWorkspace(
  workspaceId: string,
): Promise<WorkspaceSummary["role"] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return (data?.role as WorkspaceSummary["role"]) ?? null;
}

function pickStatus(ws: unknown): string | undefined {
  if (!ws) return undefined;
  const obj = Array.isArray(ws) ? ws[0] : ws;
  return (obj as { status?: string } | null)?.status;
}

function pickCreatedAt(ws: unknown): string {
  if (!ws) return "";
  const obj = Array.isArray(ws) ? ws[0] : ws;
  return ((obj as { created_at?: string } | null)?.created_at) ?? "";
}
