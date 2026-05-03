import { getCountryLabel } from "@/lib/countries";
import { createServiceClient } from "@/lib/supabase/server";
import { getFromAddress, getResend } from "./client";
import {
  type Locale,
  renderCompleteEmail,
  renderFailedEmail,
} from "./templates";

/**
 * Resolves the email address(es) of every active member in the workspace.
 * v0.1: every workspace has exactly one member (the owner), so we send to
 * that single address. The function is shaped to scale to multi-member
 * workspaces later without runner-side changes.
 *
 * Honors the workspace.email_notifications toggle: if the user has turned
 * notifications off in /settings, we return an empty list (and the caller
 * skips the send entirely).
 */
async function getWorkspaceRecipients(workspaceId: string): Promise<string[]> {
  const admin = createServiceClient();

  const { data: ws } = await admin
    .from("workspaces")
    .select("email_notifications")
    .eq("id", workspaceId)
    .single();
  const wsRow = ws as { email_notifications?: boolean } | null;
  // Default true so that workspaces created before migration 0006 still get
  // notified — the toggle has to be explicitly flipped off to silence.
  if (wsRow && wsRow.email_notifications === false) return [];

  const { data: members } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const memberRows = (members ?? []) as Array<{ user_id: string }>;
  if (memberRows.length === 0) return [];

  const ids = memberRows.map((m) => m.user_id);
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map<string, string>();
  for (const u of usersData?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }
  return ids
    .map((id: string) => emailById.get(id))
    .filter((e: string | undefined): e is string => !!e);
}

interface SimulationContext {
  simulationId: string;
  workspaceId: string;
  projectId: string;
  productName: string;
  locale: Locale;
}

interface CompleteContext extends SimulationContext {
  successScore: number | null;
  bestCountry: string | null;
  recommendedPriceCents: number | null;
}

interface FailedContext extends SimulationContext {
  errorMessage: string;
}

function appUrl(): string {
  // Vercel surfaces the deployment URL via env. Fall back to the public site.
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "https://") ??
    "https://market-twin.vercel.app"
  );
}

function resultsUrl(ctx: SimulationContext): string {
  return `${appUrl()}/${ctx.locale}/projects/${ctx.projectId}/results?sim=${ctx.simulationId}`;
}

function ensembleResultsUrl(args: {
  locale: Locale;
  projectId: string;
  ensembleId: string;
}): string {
  return `${appUrl()}/${args.locale}/projects/${args.projectId}/results?ensemble=${args.ensembleId}`;
}

function projectUrl(ctx: SimulationContext): string {
  return `${appUrl()}/${ctx.locale}/projects/${ctx.projectId}`;
}

/**
 * Best-effort email sender. Never throws — a logged warning is enough.
 * The simulation outcome is the source of truth; email is just a courtesy.
 */
export async function notifySimulationComplete(ctx: CompleteContext): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    const recipients = await getWorkspaceRecipients(ctx.workspaceId);
    if (recipients.length === 0) return;

    const { subject, html, text } = renderCompleteEmail({
      locale: ctx.locale,
      productName: ctx.productName,
      successScore: ctx.successScore,
      bestCountry: ctx.bestCountry,
      bestCountryLabel: ctx.bestCountry
        ? getCountryLabel(ctx.bestCountry, ctx.locale) || ctx.bestCountry
        : null,
      recommendedPriceUsd:
        ctx.recommendedPriceCents !== null
          ? ctx.recommendedPriceCents / 100
          : null,
      resultsUrl: resultsUrl(ctx),
    });

    await resend.emails.send({
      from: getFromAddress(),
      to: recipients,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.warn("[notify] complete email failed", err);
  }
}

/**
 * Notify when an ensemble (N parallel sims aggregated) completes. Targets
 * BOTH the workspace member list AND the optional notify_email captured in
 * the wizard — deep tier runs 30+ minutes, so the user typically left the
 * page; we want to reach them via whichever address they prefer.
 */
export async function notifyEnsembleComplete(args: {
  ensembleId: string;
  workspaceId: string;
  projectId: string;
  productName: string;
  locale: Locale;
  tier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
  bestCountry: string | null;
  consensusPercent: number;
  confidence: "STRONG" | "MODERATE" | "WEAK";
  notifyEmail?: string | null;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    const recipients = new Set<string>();
    for (const r of await getWorkspaceRecipients(args.workspaceId)) recipients.add(r);
    if (args.notifyEmail) recipients.add(args.notifyEmail);
    if (recipients.size === 0) return;

    const url = ensembleResultsUrl({
      locale: args.locale,
      projectId: args.projectId,
      ensembleId: args.ensembleId,
    });
    const TIER_NAMES: Record<typeof args.tier, { ko: string; en: string }> = {
      hypothesis: { ko: "초기검증", en: "Hypothesis" },
      decision: { ko: "검증분석", en: "Decision" },
      decision_plus: { ko: "검증분석+", en: "Decision+" },
      deep: { ko: "심층분석", en: "Deep" },
      deep_pro: { ko: "심층분석 Pro", en: "Deep Pro" },
    };
    const tierLabel = (TIER_NAMES[args.tier] ?? TIER_NAMES.decision)[
      args.locale === "ko" ? "ko" : "en"
    ];
    const countryLabel = args.bestCountry
      ? getCountryLabel(args.bestCountry, args.locale) || args.bestCountry
      : "—";
    const isKo = args.locale === "ko";

    const subject = isKo
      ? `[Market Twin] ${args.productName} 분석 완료 — 추천: ${countryLabel} (${args.consensusPercent}%)`
      : `[Market Twin] ${args.productName} analysis ready — Recommendation: ${countryLabel} (${args.consensusPercent}%)`;

    const text = isKo
      ? `${tierLabel} 분석이 완료되었습니다.\n\n` +
        `제품: ${args.productName}\n` +
        `추천 진출국: ${countryLabel} (합의도 ${args.consensusPercent}%, ${args.confidence})\n\n` +
        `결과 보기: ${url}\n`
      : `Your ${tierLabel} analysis is ready.\n\n` +
        `Product: ${args.productName}\n` +
        `Recommended market: ${countryLabel} (${args.consensusPercent}% consensus, ${args.confidence})\n\n` +
        `View results: ${url}\n`;

    const html =
      `<div style="font-family:system-ui,-apple-system,'Pretendard',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6">` +
      `<div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${tierLabel} ${isKo ? "분석 완료" : "analysis ready"}</div>` +
      `<h1 style="margin:0 0 14px;font-size:22px;font-weight:700;letter-spacing:-0.02em">${args.productName}</h1>` +
      `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:18px">` +
      `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${isKo ? "추천 진출국" : "Recommended market"}</div>` +
      `<div style="font-size:28px;font-weight:700;color:#0f172a">${countryLabel}</div>` +
      `<div style="margin-top:6px;color:#475569;font-size:14px">${args.consensusPercent}% ${isKo ? "합의도" : "consensus"} · <span style="color:${args.confidence === "STRONG" ? "#16a34a" : args.confidence === "MODERATE" ? "#ca8a04" : "#dc2626"};font-weight:600">${args.confidence}</span></div>` +
      `</div>` +
      `<a href="${url}" style="display:inline-block;background:#0A1F4D;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${isKo ? "결과 보기" : "View full results"}</a>` +
      `<p style="color:#94a3b8;font-size:12px;margin-top:32px">Market Twin · ${tierLabel}</p>` +
      `</div>`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [...recipients],
      subject,
      html,
      text,
    });
  } catch (err) {
    console.warn("[notify] ensemble email failed", err);
  }
}

export async function notifySimulationFailed(ctx: FailedContext): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    const recipients = await getWorkspaceRecipients(ctx.workspaceId);
    if (recipients.length === 0) return;

    const { subject, html, text } = renderFailedEmail({
      locale: ctx.locale,
      productName: ctx.productName,
      errorMessage: ctx.errorMessage.slice(0, 800),
      retryUrl: projectUrl(ctx),
    });

    await resend.emails.send({
      from: getFromAddress(),
      to: recipients,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.warn("[notify] failed-email failed", err);
  }
}
