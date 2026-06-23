"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Loader2, AlertCircle, ExternalLink, ArrowLeft } from "lucide-react";
import { loadTossPayments } from "@tosspayments/payment-sdk";

/**
 * Routes the user to the right checkout flow based on currency:
 *   USD → POST /api/billing/checkout, then redirect to the Stripe URL
 *   KRW → load Toss SDK in-browser, call requestBillingAuth, which
 *         redirects to Toss's hosted card-entry page → on success
 *         Toss redirects back to /billing/toss-success with authKey,
 *         which posts to /api/billing/toss/issue
 *
 * Both flows produce the same end state: an active subscription row
 * with billingKey / stripe_subscription_id populated. The user lands
 * on /billing afterward.
 *
 * Mounted as a single-purpose page (/billing/upgrade) so the
 * redirect-on-mount pattern doesn't fight the rest of the dashboard.
 */
export function UpgradeDispatcher({
  locale,
  planSlug,
  planName,
  cycle,
  currency,
  workspaceId,
  userEmail,
}: {
  locale: string;
  planSlug: "starter" | "growth";
  planName: string;
  cycle: "monthly" | "annual";
  currency: "usd" | "krw";
  workspaceId: string;
  userEmail: string;
}) {
  const isKo = locale === "ko";
  const [stage, setStage] = useState<"idle" | "loading" | "redirecting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Guard against dev double-mounts (React strict mode) firing two
  // checkouts. Once we kick off, ignore further effect runs.
  const startedRef = useRef(false);

  const start = async () => {
    setStage("loading");
    setError(null);
    try {
      if (currency === "usd") {
        // Stripe path — server creates Checkout Session, we redirect.
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planSlug, cycle, locale }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail ?? j.error ?? "checkout_failed");
        }
        const { url } = (await res.json()) as { url: string };
        setStage("redirecting");
        window.location.href = url;
        return;
      }

      // Toss path — billing-auth flow. Redirects out of our SPA.
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        throw new Error(
          isKo
            ? "토스페이먼츠 클라이언트 키가 설정되지 않았습니다. 관리자에게 문의해주세요."
            : "Toss client key is not configured. Contact support.",
        );
      }
      const toss = await loadTossPayments(clientKey);
      const origin = window.location.origin;
      // We'll round-trip back to /billing/toss-success with all the
      // context (plan / cycle) so the success page knows what to charge.
      const successUrl =
        `${origin}/${locale}/billing/toss-success` +
        `?plan=${planSlug}&cycle=${cycle}`;
      const failUrl = `${origin}/${locale}/billing?checkout=canceled`;

      setStage("redirecting");
      await toss.requestBillingAuth("카드", {
        customerKey: workspaceId,
        successUrl,
        failUrl,
        customerEmail: userEmail,
      });
      // requestBillingAuth navigates away — code below this line only
      // runs if the navigation was blocked (e.g. popup blocker).
    } catch (err) {
      console.error("[upgrade dispatcher]", err);
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-7 text-center">
        <div className="text-xs uppercase tracking-[0.15em] text-brand font-semibold mb-2">
          {isKo ? "결제로 이동" : "Routing to checkout"}
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">
          {planName}{" "}
          <span className="text-base font-normal text-slate-500">
            ({cycle === "annual" ? (isKo ? "연간" : "Annual") : isKo ? "월간" : "Monthly"} ·{" "}
            {currency.toUpperCase()})
          </span>
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          {currency === "usd"
            ? isKo
              ? "Stripe 결제 페이지로 이동 중..."
              : "Redirecting to Stripe checkout..."
            : isKo
              ? "토스페이먼츠 결제 위젯을 여는 중..."
              : "Opening TossPayments billing widget..."}
        </p>

        {(stage === "loading" || stage === "redirecting") && (
          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin text-brand" />
            <span>
              {stage === "redirecting"
                ? isKo
                  ? "이동 중..."
                  : "Redirecting..."
                : isKo
                  ? "준비 중..."
                  : "Preparing..."}
            </span>
          </div>
        )}

        {stage === "error" && (
          <div className="text-left">
            <div className="flex items-start gap-2 rounded-md bg-risk-soft/40 border border-risk/20 px-3 py-2.5 text-sm text-slate-700 mb-4">
              <AlertCircle size={16} className="text-risk shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">
                  {isKo ? "결제 시작 실패" : "Could not start checkout"}
                </div>
                <div className="text-xs text-slate-600 break-words">{error}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  void start();
                }}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
              >
                {isKo ? "다시 시도" : "Try again"}
              </button>
              <Link
                href="/plans"
                className="btn-secondary inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft size={14} />
                {isKo ? "플랜 다시 선택" : "Choose plan"}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {isKo ? "계속 안 되면 " : "If this keeps failing, "}
              <a
                href="mailto:contact@markettwin.ai"
                className="text-brand hover:underline inline-flex items-center gap-1"
              >
                contact@markettwin.ai
                <ExternalLink size={11} />
              </a>
              {isKo ? "로 연락주세요." : "."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
