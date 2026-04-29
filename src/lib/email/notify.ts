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
 */
async function getWorkspaceRecipients(workspaceId: string): Promise<string[]> {
  const admin = createServiceClient();
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
