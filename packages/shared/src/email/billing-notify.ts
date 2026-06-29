import { createServiceClient } from "@/lib/supabase/admin";
import { getFromAddress, getResend } from "./client";

/**
 * Billing-event email notifications. Best-effort — every helper
 * swallows errors so a Resend outage can't roll back a successful
 * payment write or rate-limit a webhook handler.
 *
 * All copy is bilingual (KO/EN) and inlined here rather than in
 * templates.ts because billing emails have distinct semantics + are
 * sent less frequently than sim-completion emails.
 */

type Locale = "ko" | "en";

export interface BillingNotifyArgs {
  workspaceId: string;
  locale?: Locale;
}

interface PaymentFailedArgs extends BillingNotifyArgs {
  planName: string;
  amountCents?: number | null;
  currency?: string | null;
  reason?: string | null;
  /** URL where the user can update card / retry */
  manageUrl?: string | null;
}

interface PaymentSucceededArgs extends BillingNotifyArgs {
  planName: string;
  amountCents: number;
  currency: string;
  invoiceUrl?: string | null;
  isRenewal: boolean;
}

interface TrialEndingArgs extends BillingNotifyArgs {
  daysLeft: number;
  upgradeUrl: string;
}

interface TrialEndedArgs extends BillingNotifyArgs {
  upgradeUrl: string;
}

interface SinglePaymentExpiringArgs extends BillingNotifyArgs {
  planName: string;
  daysLeft: number;
  upgradeUrl: string;
}

/** Resolve workspace owner email + locale (defaults to ko). */
async function getRecipientContext(
  workspaceId: string,
  forcedLocale?: Locale,
): Promise<{ email: string; locale: Locale } | null> {
  const admin = createServiceClient();

  const { data: ws } = await admin
    .from("workspaces")
    .select("email_notifications")
    .eq("id", workspaceId)
    .single();
  const wsRow = ws as { email_notifications?: boolean } | null;
  // Honor opt-out — billing emails respect the same toggle as sim
  // notifications. (Critical events like payment_failed could in theory
  // bypass, but the user can always check /billing.)
  if (wsRow && wsRow.email_notifications === false) return null;

  const { data: members } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .limit(1);
  const ownerId = (members?.[0] as { user_id?: string } | undefined)?.user_id;
  if (!ownerId) return null;

  const { data: u } = await admin.auth.admin.getUserById(ownerId);
  const email = u?.user?.email;
  if (!email) return null;

  return {
    email,
    locale:
      forcedLocale ??
      ((u?.user?.user_metadata as { locale?: string } | null)?.locale === "en" ? "en" : "ko"),
  };
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "https://") ??
    "https://app.markettwin.ai"
  );
}

function billingUrl(locale: Locale): string {
  return `${appUrl()}/${locale}/billing`;
}

function plansUrl(locale: Locale): string {
  return `${appUrl()}/${locale}/plans`;
}

function formatAmount(cents: number, currency: string): string {
  const ccy = currency.toUpperCase();
  const isZeroDecimal = ["KRW", "JPY", "VND", "IDR"].includes(ccy);
  const value = isZeroDecimal ? Math.round(cents / 100) : cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
      maximumFractionDigits: isZeroDecimal ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-US")} ${ccy}`;
  }
}

const ENV_BUTTON_BG = "#0A1F4D";
function shellHtml(opts: {
  eyebrow: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  return (
    `<div style="font-family:system-ui,-apple-system,'Pretendard',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6">` +
    `<div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${opts.eyebrow}</div>` +
    `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;letter-spacing:-0.02em">${opts.title}</h1>` +
    `<div style="font-size:14.5px;color:#334155">${opts.bodyHtml}</div>` +
    (opts.ctaUrl && opts.ctaLabel
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:${ENV_BUTTON_BG};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;margin-top:18px">${opts.ctaLabel}</a>`
      : "") +
    (opts.footnote
      ? `<p style="color:#94a3b8;font-size:12px;margin-top:32px">${opts.footnote}</p>`
      : "") +
    `</div>`
  );
}

export async function notifyPaymentFailed(args: PaymentFailedArgs): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    const recipient = await getRecipientContext(args.workspaceId, args.locale);
    if (!recipient) return;
    const isKo = recipient.locale === "ko";
    const url = args.manageUrl ?? billingUrl(recipient.locale);

    const subject = isKo
      ? `[Market Twin] 결제 실패 — ${args.planName} 카드 정보 업데이트가 필요합니다`
      : `[Market Twin] Payment failed — please update your card for ${args.planName}`;

    const amountLine =
      args.amountCents != null && args.currency
        ? isKo
          ? `<p>청구 금액: <strong>${formatAmount(args.amountCents, args.currency)}</strong></p>`
          : `<p>Amount: <strong>${formatAmount(args.amountCents, args.currency)}</strong></p>`
        : "";

    const reasonLine = args.reason
      ? isKo
        ? `<p style="color:#64748b;font-size:13px">사유: ${args.reason}</p>`
        : `<p style="color:#64748b;font-size:13px">Reason: ${args.reason}</p>`
      : "";

    const bodyHtml = isKo
      ? `<p>${args.planName} 플랜의 정기 결제가 실패했습니다. 카드 정보를 업데이트하지 않으면 곧 서비스가 일시 중단됩니다.</p>` +
        amountLine +
        reasonLine
      : `<p>The recurring charge for your ${args.planName} plan failed. If you don't update your card, your service will pause soon.</p>` +
        amountLine +
        reasonLine;

    const text = isKo
      ? `${args.planName} 정기 결제가 실패했습니다.\n결제 정보 업데이트: ${url}\n`
      : `Your ${args.planName} renewal failed.\nUpdate payment: ${url}\n`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [recipient.email],
      subject,
      html: shellHtml({
        eyebrow: isKo ? "결제 실패" : "Payment Failed",
        title: isKo ? "결제 정보 업데이트가 필요합니다" : "Action needed: update payment",
        bodyHtml,
        ctaLabel: isKo ? "결제 정보 관리" : "Update payment",
        ctaUrl: url,
        footnote: "Market Twin · Billing",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] payment_failed email failed", err);
  }
}

export async function notifyPaymentSucceeded(args: PaymentSucceededArgs): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    const recipient = await getRecipientContext(args.workspaceId, args.locale);
    if (!recipient) return;
    const isKo = recipient.locale === "ko";
    const amount = formatAmount(args.amountCents, args.currency);
    const url = args.invoiceUrl ?? billingUrl(recipient.locale);

    const subject = isKo
      ? `[Market Twin] 결제 완료 — ${args.planName} ${amount}`
      : `[Market Twin] Payment received — ${args.planName} ${amount}`;

    const bodyHtml = isKo
      ? `<p>${args.isRenewal ? "정기 결제가 갱신되었습니다" : "결제가 완료되어 구독이 시작되었습니다"}.</p>` +
        `<p>플랜: <strong>${args.planName}</strong><br>금액: <strong>${amount}</strong></p>`
      : `<p>${args.isRenewal ? "Your subscription has been renewed" : "Your subscription is now active"}.</p>` +
        `<p>Plan: <strong>${args.planName}</strong><br>Amount: <strong>${amount}</strong></p>`;

    const text = isKo
      ? `${args.planName} 결제 ${amount} 완료.\n${args.invoiceUrl ? `영수증: ${args.invoiceUrl}\n` : ""}결제 페이지: ${billingUrl(recipient.locale)}\n`
      : `Charged ${amount} for ${args.planName}.\n${args.invoiceUrl ? `Receipt: ${args.invoiceUrl}\n` : ""}Billing: ${billingUrl(recipient.locale)}\n`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [recipient.email],
      subject,
      html: shellHtml({
        eyebrow: isKo ? "결제 완료" : "Payment Received",
        title: isKo ? "감사합니다" : "Thank you",
        bodyHtml,
        ctaLabel: args.invoiceUrl ? (isKo ? "영수증 보기" : "View receipt") : isKo ? "결제 페이지로" : "Open billing",
        ctaUrl: url,
        footnote: "Market Twin · Billing",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] payment_succeeded email failed", err);
  }
}

export async function notifyTrialEndingSoon(args: TrialEndingArgs): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    const recipient = await getRecipientContext(args.workspaceId, args.locale);
    if (!recipient) return;
    const isKo = recipient.locale === "ko";

    const subject = isKo
      ? `[Market Twin] Free Trial ${args.daysLeft}일 남음 — 업그레이드 안내`
      : `[Market Twin] Your trial ends in ${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"}`;

    const bodyHtml = isKo
      ? `<p>Free Trial이 <strong>${args.daysLeft}일 후</strong> 종료됩니다. 진행 중인 분석을 계속하려면 유료 플랜으로 업그레이드해주세요.</p>` +
        `<p style="color:#64748b;font-size:13px">트라이얼 종료 후에는 새 시뮬레이션을 시작할 수 없으며, 기존 결과는 read-only 상태로 유지됩니다.</p>`
      : `<p>Your free trial ends in <strong>${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"}</strong>. Upgrade to a paid plan to keep running analyses.</p>` +
        `<p style="color:#64748b;font-size:13px">After the trial ends, you won't be able to start new simulations; past results stay accessible as read-only.</p>`;

    const text = isKo
      ? `Free Trial이 ${args.daysLeft}일 후 종료됩니다.\n업그레이드: ${args.upgradeUrl}\n`
      : `Your trial ends in ${args.daysLeft} day(s).\nUpgrade: ${args.upgradeUrl}\n`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [recipient.email],
      subject,
      html: shellHtml({
        eyebrow: isKo ? "트라이얼 종료 임박" : "Trial Ending",
        title: isKo
          ? `Free Trial ${args.daysLeft}일 남음`
          : `${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"} left in your trial`,
        bodyHtml,
        ctaLabel: isKo ? "플랜 선택하기" : "Choose a plan",
        ctaUrl: args.upgradeUrl,
        footnote: "Market Twin · Billing",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] trial_ending email failed", err);
  }
}

export async function notifyTrialEnded(args: TrialEndedArgs): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    const recipient = await getRecipientContext(args.workspaceId, args.locale);
    if (!recipient) return;
    const isKo = recipient.locale === "ko";

    const subject = isKo
      ? "[Market Twin] Free Trial이 종료되었습니다"
      : "[Market Twin] Your free trial has ended";

    const bodyHtml = isKo
      ? `<p>Free Trial이 종료되어 새 시뮬레이션을 시작할 수 없습니다. 유료 플랜으로 업그레이드하면 즉시 다시 분석을 진행할 수 있습니다.</p>` +
        `<p style="color:#64748b;font-size:13px">기존 결과 페이지·PDF·공유 링크는 그대로 사용 가능합니다.</p>`
      : `<p>Your free trial has ended, and new simulations are paused. Upgrade to a paid plan to resume immediately.</p>` +
        `<p style="color:#64748b;font-size:13px">Past result pages, PDFs, and share links remain accessible.</p>`;

    const text = isKo
      ? `Free Trial이 종료되었습니다.\n업그레이드: ${args.upgradeUrl}\n`
      : `Your trial has ended.\nUpgrade: ${args.upgradeUrl}\n`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [recipient.email],
      subject,
      html: shellHtml({
        eyebrow: isKo ? "트라이얼 종료" : "Trial Ended",
        title: isKo ? "유료 플랜으로 계속 진행하시겠어요?" : "Ready to continue?",
        bodyHtml,
        ctaLabel: isKo ? "플랜 선택하기" : "Choose a plan",
        ctaUrl: args.upgradeUrl,
        footnote: "Market Twin · Billing",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] trial_ended email failed", err);
  }
}

/**
 * 나이스페이먼츠 단건결제 이용기간 만료 임박 안내. 단건은 자동갱신이 없어,
 * 만료 전에 재결제하지 않으면 접근이 끊긴다 — 그 전에 재구매를 유도한다.
 */
export async function notifySinglePaymentExpiring(args: SinglePaymentExpiringArgs): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    const recipient = await getRecipientContext(args.workspaceId, args.locale);
    if (!recipient) return;
    const isKo = recipient.locale === "ko";

    const subject = isKo
      ? `[Market Twin] ${args.planName} 이용기간 ${args.daysLeft}일 남음 — 재결제 안내`
      : `[Market Twin] ${args.planName} expires in ${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"} — renew to continue`;

    const bodyHtml = isKo
      ? `<p><strong>${args.planName}</strong> 이용기간이 <strong>${args.daysLeft}일 후</strong> 만료됩니다. 1회성 결제라 자동으로 갱신되지 않으니, 계속 이용하시려면 만료 전에 재결제해주세요.</p>` +
        `<p style="color:#64748b;font-size:13px">만료 후에는 새 시뮬레이션을 시작할 수 없으며, 기존 결과·PDF·공유 링크는 그대로 열람 가능합니다.</p>`
      : `<p>Your <strong>${args.planName}</strong> access expires in <strong>${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"}</strong>. This was a one-time payment with no auto-renewal — re-purchase before it ends to keep going.</p>` +
        `<p style="color:#64748b;font-size:13px">After expiry you can't start new simulations; past results, PDFs, and share links stay accessible.</p>`;

    const text = isKo
      ? `${args.planName} 이용기간이 ${args.daysLeft}일 후 만료됩니다. 자동갱신이 없으니 재결제가 필요합니다.\n재결제: ${args.upgradeUrl}\n`
      : `Your ${args.planName} access expires in ${args.daysLeft} day(s). No auto-renewal — renew to continue.\nRenew: ${args.upgradeUrl}\n`;

    await resend.emails.send({
      from: getFromAddress(),
      to: [recipient.email],
      subject,
      html: shellHtml({
        eyebrow: isKo ? "이용기간 만료 임박" : "Access Expiring",
        title: isKo
          ? `${args.planName} 이용 ${args.daysLeft}일 남음`
          : `${args.daysLeft} day${args.daysLeft === 1 ? "" : "s"} of ${args.planName} left`,
        bodyHtml,
        ctaLabel: isKo ? "재결제하기" : "Renew now",
        ctaUrl: args.upgradeUrl,
        footnote: "Market Twin · Billing",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] single_payment_expiring email failed", err);
  }
}

/**
 * 운영 알림 — 새 회원가입(첫 워크스페이스 생성) 시 내부 담당자에게 통지.
 * 수신자는 SIGNUP_NOTIFY_EMAIL(기본 chris@markettwin.ai). best-effort.
 */
export async function notifyNewSignup(args: { userEmail: string; workspaceId: string }): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const to = process.env.SIGNUP_NOTIFY_EMAIL ?? "chris@markettwin.ai";
  try {
    await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject: `[Market Twin] 새 회원가입 — ${args.userEmail}`,
      html: shellHtml({
        eyebrow: "New Signup",
        title: "새 회원가입",
        bodyHtml:
          `<p>새 사용자가 가입했습니다.</p>` +
          `<p>이메일: <strong>${args.userEmail}</strong></p>` +
          `<p style="color:#64748b;font-size:13px">워크스페이스 ID: ${args.workspaceId}</p>`,
        footnote: "Market Twin · Ops",
      }),
      text: `새 회원가입: ${args.userEmail}\n워크스페이스: ${args.workspaceId}\n`,
    });
  } catch (err) {
    console.warn("[billing-notify] new_signup email failed", err);
  }
}

/**
 * 운영 알림 — 시스템 헬스체크에서 warn/fail이 잡히면 담당자에게 통지.
 * 수신자 OPS_ALERT_EMAIL(기본 chris@markettwin.ai). best-effort.
 */
export async function notifySystemHealthAlert(args: {
  overallStatus: string;
  failing: Array<{ label: string; status: string; detail: string }>;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const to = process.env.OPS_ALERT_EMAIL ?? "chris@markettwin.ai";
  try {
    const rows = args.failing
      .map((c) => {
        const dot = c.status === "fail" ? "🔴" : "🟡";
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef2f7">${dot} <strong>${c.label}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#475569">${c.detail}</td></tr>`;
      })
      .join("");
    const text = args.failing.map((c) => `[${c.status}] ${c.label}: ${c.detail}`).join("\n");
    await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject: `[Market Twin] ⚠️ 시스템 점검 알림 — ${args.failing.length}건 (${args.overallStatus.toUpperCase()})`,
      html: shellHtml({
        eyebrow: "System Health",
        title: `점검에서 ${args.failing.length}건 이상 감지`,
        bodyHtml:
          `<p>아래 항목을 확인해주세요. (🔴 고장 · 🟡 주의)</p>` +
          `<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">${rows}</table>` +
          `<p style="color:#94a3b8;font-size:12px;margin-top:14px">정상 복구되면 다음 점검부터 이 메일은 발송되지 않습니다.</p>`,
        footnote: "Market Twin · Monitoring",
      }),
      text,
    });
  } catch (err) {
    console.warn("[billing-notify] system_health_alert email failed", err);
  }
}

/** Plans-page URL helper exposed for callers that don't already have one. */
export function defaultUpgradeUrl(locale: Locale): string {
  return plansUrl(locale);
}
