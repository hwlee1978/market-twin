"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, Mail, Trash2, UserPlus, X } from "lucide-react";
import type { Invitation, Member, Role } from "@/lib/team";

export interface SeatsView {
  used: number;
  limit: number;
  unlimited: boolean;
  remaining: number | null;
  planName: string;
}

const ASSIGNABLE: Role[] = ["admin", "analyst", "viewer"];

/**
 * Seat management: invite, change roles, remove members, revoke invites.
 *
 * Server-rendered data comes in as props; every mutation goes through the
 * /api/team routes and then router.refresh() so the server component stays
 * the single source of truth rather than this component keeping a parallel
 * copy of the member list.
 */
export function TeamManager({
  members,
  invitations,
  seats,
  myRole,
}: {
  members: Member[];
  invitations: Invitation[];
  seats: SeatsView;
  myRole: Role;
}) {
  const t = useTranslations("team");
  const locale = useLocale();
  const router = useRouter();

  const canManage = myRole === "owner" || myRole === "admin";
  const seatsFull = !seats.unlimited && (seats.remaining ?? 0) <= 0;

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const seatPct = useMemo(() => {
    if (seats.unlimited || seats.limit <= 0) return 0;
    return Math.min(100, Math.round((seats.used / seats.limit) * 100));
  }, [seats]);

  const call = async (
    key: string,
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown> | null> => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, init);
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(t(errorKey(json.error as string) as "errors.generic"));
        return null;
      }
      return json;
    } catch {
      setError(t("errors.generic"));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const json = await call("invite", "/api/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, locale: locale === "en" ? "en" : "ko" }),
    });
    if (!json) return;
    setEmail("");
    // Mail delivery is best-effort — if Resend is unconfigured or bounced,
    // say so instead of leaving the admin waiting for an email that will
    // never arrive.
    setNotice(json.emailed === false ? t("invite.sentNoEmail") : t("invite.sent"));
    router.refresh();
  };

  const revoke = async (id: string) => {
    const json = await call(`revoke:${id}`, `/api/team/invitations/${id}`, {
      method: "DELETE",
    });
    if (json) router.refresh();
  };

  const changeRole = async (userId: string, next: Role) => {
    const json = await call(`role:${userId}`, `/api/team/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (json) router.refresh();
  };

  const remove = async (userId: string, isSelf: boolean) => {
    if (!window.confirm(isSelf ? t("members.leaveConfirm") : t("members.removeConfirm"))) {
      return;
    }
    const json = await call(`remove:${userId}`, `/api/team/members/${userId}`, {
      method: "DELETE",
    });
    if (!json) return;
    if (isSelf) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* ── Seat meter ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{t("seats.title")}</h3>
          <span className="text-xs text-slate-500">
            {t("seats.plan", { plan: seats.planName })}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {seats.used}
          </span>
          <span className="text-sm text-slate-500">
            / {seats.unlimited ? t("seats.unlimited") : seats.limit}
          </span>
        </div>
        {!seats.unlimited ? (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                seatPct >= 100 ? "bg-rose-500" : seatPct >= 80 ? "bg-amber-500" : "bg-indigo-500"
              }`}
              style={{ width: `${seatPct}%` }}
            />
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t("seats.note")}
        </p>
      </div>

      {/* ── Invite ─────────────────────────────────────────────────── */}
      {canManage ? (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-500" />
            {t("invite.title")}
          </h3>
          <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("invite.emailPlaceholder")}
              disabled={seatsFull || busy === "invite"}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={seatsFull || busy === "invite"}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50"
            >
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}` as "roles.analyst")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={seatsFull || busy === "invite"}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "invite" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {t("invite.cta")}
            </button>
          </form>
          {seatsFull ? (
            <p className="mt-3 text-sm text-amber-700">{t("invite.seatsFull")}</p>
          ) : null}
          {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </div>
      ) : null}

      {/* ── Pending invitations ────────────────────────────────────── */}
      {invitations.length > 0 ? (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900">
            {t("pending.title", { n: invitations.length })}
          </h3>
          <ul className="mt-3 divide-y divide-slate-100">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {inv.email}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {t(`roles.${inv.role}` as "roles.analyst")} ·{" "}
                    {inv.expired
                      ? t("pending.expired")
                      : t("pending.expiresOn", {
                          date: new Date(inv.expiresAt).toLocaleDateString(locale),
                        })}
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    disabled={busy === `revoke:${inv.id}`}
                    title={t("pending.revoke")}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    {busy === `revoke:${inv.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Members ────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("members.title")}{" "}
          <span className="text-slate-400 font-normal">
            {t("members.count", { n: members.length })}
          </span>
        </h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {members.map((m) => {
            const ownerCount = members.filter((x) => x.role === "owner").length;
            const lastOwner = m.role === "owner" && ownerCount === 1;
            return (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: avatarColor(m.email) }}
                >
                  {m.email[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {m.email}
                    {m.isSelf ? (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {t("members.you")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {t("members.joined", {
                      date: new Date(m.createdAt).toLocaleDateString(locale),
                    })}
                  </div>
                </div>

                {canManage && !lastOwner ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                    disabled={busy === `role:${m.userId}`}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                  >
                    {/* Only an owner can mint another owner; the API enforces
                        this too, the option is hidden to avoid a dead choice. */}
                    {(myRole === "owner" ? (["owner", ...ASSIGNABLE] as Role[]) : ASSIGNABLE).map(
                      (r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}` as "roles.analyst")}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {t(`roles.${m.role}` as "roles.analyst")}
                  </span>
                )}

                {(canManage || m.isSelf) && !lastOwner ? (
                  <button
                    type="button"
                    onClick={() => remove(m.userId, m.isSelf)}
                    disabled={busy === `remove:${m.userId}`}
                    title={m.isSelf ? t("members.leave") : t("members.remove")}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    {busy === `remove:${m.userId}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {error && !canManage ? (
          <p className="mt-3 text-sm text-rose-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function errorKey(code: string | undefined): string {
  switch (code) {
    case "seat_limit":
      return "errors.seatLimit";
    case "already_member":
      return "errors.alreadyMember";
    case "already_invited":
      return "errors.alreadyInvited";
    case "invalid_email":
      return "errors.invalidEmail";
    case "last_owner":
      return "errors.lastOwner";
    case "insufficient_role":
      return "errors.insufficientRole";
    case "owner_only":
      return "errors.ownerOnly";
    default:
      return "errors.generic";
  }
}

/** Deterministic avatar tint so the same person keeps the same colour. */
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(150deg, hsl(${h} 62% 46%), hsl(${(h + 24) % 360} 62% 38%))`;
}
