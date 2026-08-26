/**
 * Team seats — membership, roles, and invitations.
 *
 * A seat is consumed by a current member OR a still-open invitation.
 * Counting only members would let an admin issue unlimited invites against a
 * 3-seat plan and have them all land later, so both are counted here and at
 * accept time.
 *
 * Invitation tokens are random 32-byte values. Only their sha256 is stored,
 * so a database leak yields no working invite links.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/billing/usage";
import type { WorkspaceSummary } from "@/lib/workspace";

export type Role = WorkspaceSummary["role"];

/** Roles an admin may assign. `owner` is granted by transfer, not invite. */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "analyst", "viewer"];

export const INVITE_TTL_DAYS = 14;

export interface Member {
  userId: string;
  email: string;
  role: Role;
  createdAt: string;
  isSelf: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export interface SeatUsage {
  used: number;
  limit: number;
  /** -1 means unlimited, mirroring the plan-limit convention. */
  unlimited: boolean;
  remaining: number;
  planName: string;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isAssignableRole(value: string): value is Role {
  return (ASSIGNABLE_ROLES as string[]).includes(value);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compares two sha256 hex digests without leaking timing information. Both
 * inputs are fixed-length hex here, so a length mismatch means "not found"
 * rather than a malformed request.
 */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

// ───────────────────────────────────────────────────────────── seats

export async function getSeatUsage(workspaceId: string): Promise<SeatUsage> {
  const admin = createServiceClient();
  const [{ plan }, memberRes, inviteRes] = await Promise.all([
    getSubscription(workspaceId),
    admin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    admin
      .from("workspace_invitations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const used = (memberRes.count ?? 0) + (inviteRes.count ?? 0);
  const limit = plan.limits.seats;
  const unlimited = limit < 0;
  return {
    used,
    limit,
    unlimited,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    planName: plan.name,
  };
}

// ───────────────────────────────────────────────────────────── members

/**
 * Members of a workspace with their email addresses resolved.
 *
 * Emails live in auth.users, which is not joinable from PostgREST, so this
 * pages through the admin list once. Workspaces are seat-capped in the low
 * tens, but the account-wide user list is not — hence the explicit paging
 * rather than a single 200-row call, which silently truncated once the
 * instance passed 200 users.
 */
export async function listMembers(
  workspaceId: string,
  currentUserId: string,
): Promise<Member[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("workspace_members")
    .select("user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Array<{
    user_id: string;
    role: Role;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const wanted = new Set(rows.map((r) => r.user_id));
  const emailById = await resolveEmails(wanted);

  return rows.map((r) => ({
    userId: r.user_id,
    email: emailById.get(r.user_id) ?? r.user_id,
    role: r.role,
    createdAt: r.created_at,
    isSelf: r.user_id === currentUserId,
  }));
}

async function resolveEmails(ids: Set<string>): Promise<Map<string, string>> {
  const admin = createServiceClient();
  const out = new Map<string, string>();

  // getUserById is one round-trip per member but exact; a workspace holds a
  // seat-capped handful of them, so this beats paging the whole user table.
  await Promise.all(
    [...ids].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const email = data?.user?.email;
      if (email) out.set(id, email);
    }),
  );
  return out;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceClient();
  // Supabase's admin API has no email lookup, so page until we find it.
  // Bounded at 20 pages (20k users) to keep a pathological miss cheap.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data) return null;
    const hit = data.users.find(
      (u: { id: string; email?: string }) => u.email?.toLowerCase() === email,
    );
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

// ───────────────────────────────────────────────────────── invitations

export async function listInvitations(
  workspaceId: string,
): Promise<Invitation[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("workspace_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const now = Date.now();
  return ((data ?? []) as Array<{
    id: string;
    email: string;
    role: Role;
    status: string;
    expires_at: string;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    expired: new Date(r.expires_at).getTime() < now,
  }));
}

export type InviteError =
  | "seat_limit"
  | "already_member"
  | "already_invited"
  | "invalid_email"
  | "invalid_role"
  | "insert_failed";

export interface InviteCreated {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  /** Raw token — returned once, only to build the emailed link. */
  token: string;
}

export async function createInvitation(opts: {
  workspaceId: string;
  invitedBy: string;
  email: string;
  role: Role;
}): Promise<{ ok: true; invite: InviteCreated } | { ok: false; error: InviteError }> {
  const email = normalizeEmail(opts.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!isAssignableRole(opts.role)) return { ok: false, error: "invalid_role" };

  const admin = createServiceClient();

  // Already a member? Resolve the address to a user id and check membership.
  const existingUserId = await findUserIdByEmail(email);
  if (existingUserId) {
    const { data: already } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", opts.workspaceId)
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (already) return { ok: false, error: "already_member" };
  }

  // Clear a stale invite for the same address so the unique index doesn't
  // reject a legitimate re-invite after the first one lapsed.
  await admin
    .from("workspace_invitations")
    .update({ status: "expired" })
    .eq("workspace_id", opts.workspaceId)
    .eq("email", email)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const { data: live } = await admin
    .from("workspace_invitations")
    .select("id")
    .eq("workspace_id", opts.workspaceId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (live) return { ok: false, error: "already_invited" };

  // Seat check happens after the dedupe checks so re-inviting an existing
  // member reports the real reason instead of a confusing seat error.
  const seats = await getSeatUsage(opts.workspaceId);
  if (!seats.unlimited && seats.remaining <= 0) {
    return { ok: false, error: "seat_limit" };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await admin
    .from("workspace_invitations")
    .insert({
      workspace_id: opts.workspaceId,
      email,
      role: opts.role,
      token_hash: hashToken(token),
      invited_by: opts.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "insert_failed" };

  return {
    ok: true,
    invite: { id: data.id, email, role: opts.role, expiresAt, token },
  };
}

export async function revokeInvitation(opts: {
  workspaceId: string;
  invitationId: string;
}): Promise<boolean> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("id", opts.invitationId)
    .eq("workspace_id", opts.workspaceId)
    .eq("status", "pending");
  return !error;
}

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: Role;
  expiresAt: string;
  state: "pending" | "expired" | "used" | "not_found";
}

/**
 * Read-only look at an invitation so the accept page can show what is being
 * joined before the user commits. Deliberately does not reveal anything
 * beyond the workspace name and the address the invite was sent to — both
 * of which the holder of the token already knows from the email.
 */
export async function peekInvitation(token: string): Promise<InvitePreview> {
  const admin = createServiceClient();
  const tokenHash = hashToken(token);
  const { data: rows } = await admin
    .from("workspace_invitations")
    .select("workspace_id, email, role, status, expires_at, token_hash")
    .eq("token_hash", tokenHash)
    .limit(1);

  const invite = (rows ?? [])[0] as
    | {
        workspace_id: string;
        email: string;
        role: Role;
        status: string;
        expires_at: string;
        token_hash: string;
      }
    | undefined;

  const missing: InvitePreview = {
    workspaceName: "",
    email: "",
    role: "analyst",
    expiresAt: "",
    state: "not_found",
  };
  if (!invite || !hashesEqual(invite.token_hash, tokenHash)) return missing;

  const { data: ws } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", invite.workspace_id)
    .single();

  const state: InvitePreview["state"] =
    invite.status === "accepted"
      ? "used"
      : invite.status !== "pending"
        ? "not_found"
        : new Date(invite.expires_at).getTime() < Date.now()
          ? "expired"
          : "pending";

  return {
    workspaceName: ws?.name ?? "",
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expires_at,
    state,
  };
}

export type AcceptError =
  | "not_found"
  | "expired"
  | "email_mismatch"
  | "seat_limit"
  | "join_failed";

export interface AcceptResult {
  workspaceId: string;
  workspaceName: string;
  role: Role;
  alreadyMember: boolean;
}

/**
 * Accepts an invitation on behalf of the signed-in user.
 *
 * Runs with the service role by necessity: the accepting user is not yet a
 * member, so no RLS policy could authorise their own membership insert. The
 * authorisation is the token plus the email match enforced here.
 */
export async function acceptInvitation(opts: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ ok: true; result: AcceptResult } | { ok: false; error: AcceptError }> {
  const admin = createServiceClient();
  const tokenHash = hashToken(opts.token);

  const { data: rows } = await admin
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, status, expires_at, token_hash")
    .eq("token_hash", tokenHash)
    .limit(1);

  const invite = (rows ?? [])[0] as
    | {
        id: string;
        workspace_id: string;
        email: string;
        role: Role;
        status: string;
        expires_at: string;
        token_hash: string;
      }
    | undefined;

  if (!invite || !hashesEqual(invite.token_hash, tokenHash)) {
    return { ok: false, error: "not_found" };
  }
  if (invite.status !== "pending") return { ok: false, error: "not_found" };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin
      .from("workspace_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return { ok: false, error: "expired" };
  }
  if (normalizeEmail(opts.userEmail) !== invite.email) {
    return { ok: false, error: "email_mismatch" };
  }

  const { data: ws } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", invite.workspace_id)
    .single();

  const { data: existing } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("workspace_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: opts.userId,
      })
      .eq("id", invite.id);
    return {
      ok: true,
      result: {
        workspaceId: invite.workspace_id,
        workspaceName: ws?.name ?? "",
        role: existing.role as Role,
        alreadyMember: true,
      },
    };
  }

  // The plan may have been downgraded between sending and accepting, so
  // re-check. The pending invite itself already counts toward `used`, hence
  // the comparison against the limit rather than `remaining`.
  const seats = await getSeatUsage(invite.workspace_id);
  if (!seats.unlimited && seats.used > seats.limit) {
    return { ok: false, error: "seat_limit" };
  }

  const { error: joinErr } = await admin
    .from("workspace_members")
    .insert({
      workspace_id: invite.workspace_id,
      user_id: opts.userId,
      role: invite.role,
    });
  if (joinErr) return { ok: false, error: "join_failed" };

  await admin
    .from("workspace_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: opts.userId,
    })
    .eq("id", invite.id);

  return {
    ok: true,
    result: {
      workspaceId: invite.workspace_id,
      workspaceName: ws?.name ?? "",
      role: invite.role,
      alreadyMember: false,
    },
  };
}

// ───────────────────────────────────────────────────── member mutations

export type MemberError = "not_found" | "last_owner" | "update_failed";

export async function changeMemberRole(opts: {
  workspaceId: string;
  userId: string;
  role: Role;
}): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("workspace_members")
    .update({ role: opts.role })
    .eq("workspace_id", opts.workspaceId)
    .eq("user_id", opts.userId);

  if (error) {
    // The last-owner trigger raises with message 'last_owner'.
    if (error.message?.includes("last_owner")) {
      return { ok: false, error: "last_owner" };
    }
    return { ok: false, error: "update_failed" };
  }
  return { ok: true };
}

export async function removeMember(opts: {
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", opts.workspaceId)
    .eq("user_id", opts.userId);

  if (error) {
    if (error.message?.includes("last_owner")) {
      return { ok: false, error: "last_owner" };
    }
    return { ok: false, error: "update_failed" };
  }
  return { ok: true };
}

/** Current user's id + email, or null when unauthenticated. */
export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}
