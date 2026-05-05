"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Catches Toss's success-redirect, reads ?authKey=&plan=&cycle= from
 * the URL, and posts to /api/billing/toss/issue. The server exchanges
 * authKey → billingKey and fires the first charge in one call. On
 * success we route to /billing where the dashboard reads the new
 * subscription state.
 */
export function TossSuccessHandler({ locale }: { locale: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const isKo = locale === "ko";

  const [stage, setStage] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const authKey = search.get("authKey");
    const plan = search.get("plan");
    const cycle = (search.get("cycle") ?? "monthly") as "monthly" | "annual";

    if (!authKey || (plan !== "starter" && plan !== "growth")) {
      setError(
        isKo
          ? "결제 정보가 올바르지 않습니다. 플랜 페이지로 돌아가 다시 시도해주세요."
          : "Missing or invalid payment info. Please return to the plans page and try again.",
      );
      setStage("error");
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/billing/toss/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authKey, plan, cycle }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail ?? j.error ?? "issue_failed");
        }
        setStage("success");
        // Brief success pause so the user sees the confirmation, then
        // bounce to /billing where the dashboard renders the updated
        // subscription. router.refresh() flushes the SSR cache so the
        // first paint reflects the new plan.
        setTimeout(() => {
          router.replace("/billing");
          router.refresh();
        }, 1600);
      } catch (err) {
        console.error("[toss-success]", err);
        setError(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    })();
    // search / router are stable from the hooks; eslint disabled to
    // keep the one-shot intent obvious
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-7 text-center">
        {stage === "loading" && (
          <>
            <div className="text-xs uppercase tracking-[0.15em] text-brand font-semibold mb-2">
              {isKo ? "결제 처리 중" : "Processing payment"}
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-3">
              {isKo ? "결제를 완료하는 중..." : "Finalizing your subscription..."}
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              {isKo
                ? "토스페이먼츠로부터 받은 카드 정보로 첫 결제를 진행 중입니다. 잠시만 기다려주세요."
                : "Charging your card via TossPayments. This usually takes a few seconds."}
            </p>
            <Loader2 size={20} className="animate-spin text-brand mx-auto" />
          </>
        )}
        {stage === "success" && (
          <>
            <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
            <h1 className="text-xl font-bold text-slate-900 mb-1">
              {isKo ? "구독 시작 완료" : "You're all set"}
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              {isKo
                ? "결제 페이지로 이동합니다..."
                : "Redirecting to your billing dashboard..."}
            </p>
          </>
        )}
        {stage === "error" && (
          <>
            <AlertCircle size={32} className="text-risk mx-auto mb-3" />
            <h1 className="text-xl font-bold text-slate-900 mb-1">
              {isKo ? "결제 실패" : "Payment failed"}
            </h1>
            <p className="text-sm text-slate-600 break-words mb-5">
              {error ??
                (isKo
                  ? "예상치 못한 오류가 발생했습니다."
                  : "Something unexpected went wrong.")}
            </p>
            <div className="flex gap-2 justify-center">
              <Link href="/plans" className="btn-primary inline-flex items-center gap-1.5">
                <ArrowLeft size={14} />
                {isKo ? "플랜 다시 선택" : "Pick again"}
              </Link>
              <Link href="/billing" className="btn-secondary">
                {isKo ? "결제 페이지로" : "Go to billing"}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {isKo ? "결제가 처리됐는데 이 화면이 뜨면 " : "If your card was charged but this still appears, contact "}
              <a href="mailto:contact@markettwin.ai" className="text-brand hover:underline">
                contact@markettwin.ai
              </a>
              {isKo ? "로 연락주세요. 자동 환불됩니다." : ". We'll refund automatically."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
