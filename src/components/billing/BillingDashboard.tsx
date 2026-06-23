"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, ExternalLink, Loader2, Sparkles, Settings } from "lucide-react";
import { clsx } from "clsx";
import type { PlanSlug, SubscriptionStatus } from "@/lib/billing/plans";
import { formatDate } from "@/lib/format/date";

interface PlanShape {
  slug: PlanSlug;
  name: string;
  tagline: { ko: string; en: string };
  limits: {
    simsPerMonth: number;
    decisionPlusSimsPerMonth: number;
    deepSimsPerMonth: number;
    deepProEnabled: boolean;
    chatMessagesPerMonth: number;
    seats: number;
    maxPersonasPerSim: number;
  };
  features: {
    pdfDownload: boolean;
    csvExport: boolean;
    publicShareLinks: boolean;
    multiLLM: boolean;
    apiAccess: boolean;
    sso: boolean;
    auditLogs: boolean;
    crossProjectCompare: boolean;
  };
  priceMonthly: { usd: number | null; krw: number | null };
  selfServe: boolean;
}

interface InitialState {
  plan: PlanShape;
  status: SubscriptionStatus;
  trial: {
    active: boolean;
    endsAt: string | null;
    simsUsed: number;
    simsLimit: number;
  };
  period: {
    start: string | null;
    end: string | null;
    cancelAtEnd: boolean;
  };
  paymentProvider: "stripe" | "tosspayments" | "nicepay" | null;
  // 나이스페이먼츠 단건결제(빌키 없음). true면 자동갱신이 없어 만료일을
  // '다음 결제'가 아니라 '이용 만료'로 표시한다.
  singlePayment: boolean;
  usage: {
    monthStart: string;
    simsUsed: number;
    decisionPlusSimsUsed: number;
    deepSimsUsed: number;
    chatMessagesUsed: number;
  };
}

/**
 * Workspace billing dashboard. Shows current plan + usage progress
 * + actions:
 *   - Free trial / past_due → upgrade buttons (route to /plans then
 *     either Stripe Checkout or Toss widget)
 *   - Active paid → "manage subscription" → Stripe Customer Portal
 *     (or Toss equivalent — for v1 we surface a link to email Sales
 *     for Toss customers since the portal is Stripe-only)
 *
 * Status banners surface trial-ending warnings, past-due alerts, and
 * cancel-at-period-end notices so the user never gets surprised.
 */
export function BillingDashboard({
  initial,
  locale,
}: {
  initial: InitialState;
  locale: string;
}) {
  const isKo = locale === "ko";
  const { plan, status, trial, period, paymentProvider, singlePayment, usage } = initial;
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelScheduled, setCancelScheduled] = useState(period.cancelAtEnd);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const onManage = async () => {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "portal_failed");
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : String(err));
      setPortalBusy(false);
    }
  };

  // Toss has no self-serve portal, so we cancel via our own endpoint
  // (cancel-at-period-end). Stripe cancels through the Customer Portal
  // above, so this button only shows for Toss subscriptions.
  const onCancelToss = async () => {
    const ok = window.confirm(
      isKo
        ? "구독을 취소하시겠어요?\n현재 결제 주기가 끝날 때까지는 모든 기능을 그대로 사용할 수 있고, 다음 주기부터 자동결제가 청구되지 않습니다."
        : "Cancel your subscription?\nYou keep full access until the end of the current billing period, and no further charges are made from the next cycle.",
    );
    if (!ok) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/billing/toss/cancel", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail ?? j.error ?? "cancel_failed");
      setCancelScheduled(true);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  };

  const canCancelToss =
    paymentProvider === "tosspayments" &&
    plan.slug !== "free_trial" &&
    status !== "canceled" &&
    !cancelScheduled;

  // 단건결제 자가 환불(청약철회). 자격(7일 이내·시뮬 미사용)은 서버가 최종
  // 판정하고, 부적격이면 안내 메시지를 돌려준다.
  const canRefund = singlePayment && status === "active" && plan.slug !== "free_trial";

  const onRefund = async () => {
    const ok = window.confirm(
      isKo
        ? "전액 환불을 요청하시겠어요?\n결제 후 7일 이내이고 시뮬레이션을 사용하지 않은 경우 전액 환불되며, 즉시 무료 등급으로 전환됩니다."
        : "Request a full refund?\nFull refund if within 7 days of payment and no simulations were used. You'll move to the free tier immediately.",
    );
    if (!ok) return;
    setRefundBusy(true);
    setRefundMsg(null);
    try {
      const res = await fetch("/api/billing/nice/refund", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "refund_failed");
      setRefundMsg(isKo ? "환불이 완료되었습니다. 잠시 후 새로고침됩니다." : "Refund complete. Reloading…");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setRefundMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {isKo ? "결제 및 사용량" : "Billing & Usage"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isKo
            ? "현재 플랜, 이번 달 사용량, 결제 관리"
            : "Your current plan, this month's usage, and billing controls"}
        </p>
      </div>

      <StatusBanner
        plan={plan}
        status={status}
        trial={trial}
        period={period}
        singlePayment={singlePayment}
        isKo={isKo}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plan card */}
        <div className="card p-5 lg:col-span-1 flex flex-col">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            {isKo ? "현재 플랜" : "Current plan"}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl font-bold text-slate-900">{plan.name}</span>
            <span
              className={clsx(
                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                statusBadgeClass(status),
              )}
            >
              {statusLabel(status, isKo)}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-1">
            {plan.tagline[isKo ? "ko" : "en"]}
          </p>

          <div className="flex flex-col gap-2">
            {plan.slug === "free_trial" || status === "canceled" || status === "past_due" ? (
              <Link
                href="/plans"
                className="btn-primary w-full justify-center inline-flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                {isKo ? "유료 플랜으로 업그레이드" : "Upgrade to paid plan"}
              </Link>
            ) : (
              <Link
                href="/plans"
                className="btn-secondary w-full justify-center inline-flex items-center gap-1.5"
              >
                {isKo ? "플랜 변경" : "Change plan"}
              </Link>
            )}

            {plan.slug !== "free_trial" && status !== "canceled" && !singlePayment && (
              <button
                type="button"
                onClick={onManage}
                disabled={portalBusy}
                className="btn-ghost w-full justify-center inline-flex items-center gap-1.5 text-sm"
              >
                {portalBusy ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                {isKo ? "결제 정보 관리" : "Manage billing"}
                <ExternalLink size={11} className="opacity-60" />
              </button>
            )}

            {canCancelToss && (
              <button
                type="button"
                onClick={onCancelToss}
                disabled={cancelBusy}
                className="w-full justify-center inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-risk disabled:opacity-50"
              >
                {cancelBusy && <Loader2 size={12} className="animate-spin" />}
                {isKo ? "구독 취소" : "Cancel subscription"}
              </button>
            )}

            {canRefund && (
              <button
                type="button"
                onClick={onRefund}
                disabled={refundBusy}
                className="w-full justify-center inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-risk disabled:opacity-50"
              >
                {refundBusy && <Loader2 size={12} className="animate-spin" />}
                {isKo ? "환불 요청 (7일 이내·미사용)" : "Request refund (within 7 days · unused)"}
              </button>
            )}
          </div>
          {refundMsg && <p className="mt-2 text-xs text-slate-500">{refundMsg}</p>}
          {cancelScheduled && status !== "canceled" && (
            <p className="mt-2 text-xs text-slate-500">
              {isKo
                ? "구독이 현재 결제 주기 종료 시 취소되도록 예약되었습니다."
                : "Your subscription is scheduled to cancel at the end of the current period."}
            </p>
          )}
          {cancelError && <p className="mt-2 text-xs text-risk">{cancelError}</p>}
          {portalError && (
            <p className="mt-2 text-xs text-risk">
              {portalError === "no_stripe_customer"
                ? isKo
                  ? "토스페이먼츠 고객은 별도로 연락 부탁드립니다 (contact@markettwin.ai)."
                  : "Toss customers: please contact contact@markettwin.ai for changes."
                : portalError}
            </p>
          )}
        </div>

        {/* Usage card */}
        <div className="card p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            {isKo ? "이번 달 사용량" : "This month's usage"}
          </div>
          <div className="space-y-4">
            <UsageRow
              label={isKo ? "시뮬레이션" : "Simulations"}
              used={trial.active ? trial.simsUsed : usage.simsUsed}
              limit={trial.active ? trial.simsLimit : plan.limits.simsPerMonth}
              isKo={isKo}
            />
            {plan.limits.decisionPlusSimsPerMonth > 0 && (
              <UsageRow
                label={isKo ? "검증분석 Plus tier" : "Consensus Plus tier"}
                used={usage.decisionPlusSimsUsed}
                limit={plan.limits.decisionPlusSimsPerMonth}
                isKo={isKo}
              />
            )}
            {plan.features.multiLLM && (
              <UsageRow
                label={isKo ? "심층분석 tier (멀티 LLM)" : "Triangulated tier (multi-LLM)"}
                used={usage.deepSimsUsed}
                limit={plan.limits.deepSimsPerMonth}
                isKo={isKo}
              />
            )}
            <UsageRow
              label={isKo ? "페르소나 챗 메시지" : "Persona chat messages"}
              used={usage.chatMessagesUsed}
              limit={plan.limits.chatMessagesPerMonth}
              isKo={isKo}
            />
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
            {isKo ? "사용량 갱신: " : "Usage resets: "}
            {formatDate(period.end ?? null, isKo) ??
              (isKo
                ? trial.active && trial.endsAt
                  ? `트라이얼 종료 — ${formatDate(trial.endsAt, isKo)}`
                  : "다음 달 1일"
                : trial.active && trial.endsAt
                  ? `Trial ends — ${formatDate(trial.endsAt, isKo)}`
                  : "1st of next month")}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
          {isKo ? "결제 수단 안내" : "Payment methods"}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          {process.env.NEXT_PUBLIC_KRW_PROVIDER === "nicepay"
            ? isKo
              ? "해외 카드 (Visa / Master / Amex) 결제는 Stripe로 처리되며, 국내 신용카드 결제는 나이스페이먼츠로 처리됩니다. 국내 결제는 1회성 결제로 자동갱신이 없으며, 계속 이용하려면 이용기간 만료 전 재결제가 필요합니다."
              : "International cards (Visa / Master / Amex) are processed via Stripe; Korean card payments via NICE Payments. Korean payments are one-time charges with no auto-renewal — re-purchase before the period ends to continue."
            : isKo
              ? "해외 카드 (Visa / Master / Amex) 결제는 Stripe로 처리되며, 국내 카드 및 계좌이체는 토스페이먼츠로 처리됩니다. 결제 통화는 첫 결제 시 USD 또는 KRW로 고정되며, 변경하려면 현재 구독 취소 후 재결제가 필요합니다."
              : "International cards (Visa / Master / Amex) are processed via Stripe; Korean cards and bank transfers via TossPayments. Billing currency (USD or KRW) is locked at first checkout; changing it requires canceling and re-subscribing."}
        </p>
      </div>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────── */

function StatusBanner({
  plan,
  status,
  trial,
  period,
  singlePayment,
  isKo,
}: {
  plan: PlanShape;
  status: SubscriptionStatus;
  trial: InitialState["trial"];
  period: InitialState["period"];
  singlePayment: boolean;
  isKo: boolean;
}) {
  // Trial ending soon
  if (plan.slug === "free_trial" && trial.active) {
    const endsAt = trial.endsAt ? new Date(trial.endsAt).getTime() : null;
    // eslint-disable-next-line react-hooks/purity
    const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000))) : null; // intentional: countdown needs current time
    return (
      <Banner
        tone="info"
        icon={<Sparkles size={16} />}
        title={isKo ? "베타 무료 체험 진행 중" : "Beta trial in progress"}
        body={
          isKo
            ? `시뮬 ${trial.simsUsed}/${trial.simsLimit}건 사용 · ${remaining != null ? `${remaining}일 남음` : ""}`
            : `${trial.simsUsed}/${trial.simsLimit} sims used${remaining != null ? ` · ${remaining} days left` : ""}`
        }
      />
    );
  }
  if (status === "past_due") {
    return (
      <Banner
        tone="warn"
        icon={<AlertCircle size={16} />}
        title={isKo ? "결제 실패" : "Payment failed"}
        body={
          isKo
            ? "최근 청구가 실패했습니다. 결제 정보를 업데이트해주세요. 그러지 않으면 곧 서비스가 일시 중단됩니다."
            : "The most recent charge failed. Update your payment method to avoid service interruption."
        }
      />
    );
  }
  if (status === "canceled") {
    return (
      <Banner
        tone="warn"
        icon={<AlertCircle size={16} />}
        title={isKo ? "구독 취소됨" : "Subscription canceled"}
        body={
          isKo
            ? "구독이 취소되어 무료 등급으로 전환됐습니다. 새 시뮬을 시작하려면 다시 가입해주세요."
            : "Your subscription is canceled and you've been moved to free tier. Resubscribe to start new sims."
        }
      />
    );
  }
  if (period.cancelAtEnd && period.end) {
    return (
      <Banner
        tone="info"
        icon={<AlertCircle size={16} />}
        title={isKo ? "기간 종료 시 취소 예정" : "Cancellation scheduled"}
        body={
          isKo
            ? `${formatDate(period.end, isKo)}에 자동 취소됩니다. 그 전까지는 모든 기능을 그대로 사용할 수 있습니다.`
            : `Auto-cancels on ${formatDate(period.end, isKo)}. You keep full access until then.`
        }
      />
    );
  }
  if (status === "active") {
    // 단건결제는 자동갱신이 없다 → '다음 결제'가 아니라 '이용 만료'로 안내해
    // 자동과금 오해를 막는다(공시와 일치).
    return (
      <Banner
        tone="success"
        icon={<CheckCircle2 size={16} />}
        title={isKo ? (singlePayment ? "정상 이용 중" : "정상 구독 중") : "Subscription active"}
        body={
          singlePayment
            ? isKo
              ? `이용 만료: ${formatDate(period.end, isKo) ?? "—"} · 자동갱신 없음, 계속 이용하려면 만료 전 재결제`
              : `Access until: ${formatDate(period.end, isKo) ?? "—"} · One-time payment, no auto-renewal`
            : isKo
              ? `다음 결제: ${formatDate(period.end, isKo) ?? "—"}`
              : `Next billing: ${formatDate(period.end, isKo) ?? "—"}`
        }
      />
    );
  }
  return null;
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "info" | "warn" | "success";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const cls =
    tone === "warn"
      ? "border-warn/40 bg-warn-soft/40 text-slate-800"
      : tone === "success"
        ? "border-success/40 bg-success-soft/30 text-slate-800"
        : "border-accent/30 bg-accent-50/40 text-slate-800";
  const iconCls =
    tone === "warn" ? "text-warn" : tone === "success" ? "text-success" : "text-accent";
  return (
    <div className={clsx("flex items-start gap-3 rounded-lg border px-4 py-3", cls)}>
      <span className={clsx("shrink-0 mt-0.5", iconCls)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs leading-relaxed text-slate-600 mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  isKo,
}: {
  label: string;
  used: number;
  limit: number;
  isKo: boolean;
}) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const danger = !unlimited && pct >= 90;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-slate-700">{label}</span>
        <span className="text-xs tabular-nums text-slate-500">
          {used.toLocaleString()}
          {unlimited
            ? ` / ${isKo ? "무제한" : "Unlimited"}`
            : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full transition-all",
              danger ? "bg-risk" : pct >= 70 ? "bg-warn" : "bg-brand",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function statusBadgeClass(s: SubscriptionStatus): string {
  switch (s) {
    case "active":
      return "bg-success-soft text-success";
    case "trialing":
      return "bg-accent/20 text-accent";
    case "past_due":
    case "paused":
      return "bg-warn-soft text-warn";
    case "canceled":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-200 text-slate-600";
  }
}

function statusLabel(s: SubscriptionStatus, isKo: boolean): string {
  if (isKo) {
    return {
      active: "활성",
      trialing: "베타",
      past_due: "결제실패",
      canceled: "취소됨",
      paused: "일시중지",
    }[s];
  }
  return s.replace("_", " ").toUpperCase();
}

