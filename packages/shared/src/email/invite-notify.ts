/**
 * Seat-invitation email.
 *
 * Best-effort like the rest of the notification layer: a Resend failure is
 * logged and swallowed. The invitation row is already committed at this
 * point, so the admin can always resend from the team page — losing the
 * email must not lose the invite.
 */
import { getFromAddress, getResend } from "./client";
import { type Locale, renderInviteEmail } from "./templates";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "https://") ??
    "https://app.markettwin.ai"
  );
}

export function inviteAcceptUrl(token: string, locale: Locale): string {
  return `${appUrl()}/${locale}/invite/${encodeURIComponent(token)}`;
}

export async function sendInviteEmail(args: {
  locale: Locale;
  workspaceName: string;
  inviterEmail: string;
  inviteeEmail: string;
  role: "admin" | "analyst" | "viewer";
  token: string;
  expiresAt: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("[invite] RESEND_API_KEY missing — invitation email skipped");
    return false;
  }

  try {
    const { subject, html, text } = renderInviteEmail({
      locale: args.locale,
      workspaceName: args.workspaceName,
      inviterEmail: args.inviterEmail,
      inviteeEmail: args.inviteeEmail,
      role: args.role,
      acceptUrl: inviteAcceptUrl(args.token, args.locale),
      expiresAt: args.expiresAt,
    });

    await resend.emails.send({
      from: getFromAddress(),
      to: [args.inviteeEmail],
      subject,
      html,
      text,
    });
    return true;
  } catch (err) {
    console.warn("[invite] invitation email failed", err);
    return false;
  }
}
