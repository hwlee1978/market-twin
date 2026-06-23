"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Loader2, AlertCircle, ArrowLeft, ExternalLink } from "lucide-react";

/**
 * 나이스페이먼츠 결제창(SDK) 단건결제 트리거. 마운트되면:
 *   1. POST /api/billing/nice/checkout → orderId/amount/clientId/returnUrl 수령
 *      (서버가 인증된 워크스페이스 기준으로 pending order를 적재)
 *   2. NICE JS SDK 로드 후 AUTHNICE.requestPay(...) 호출 → 결제창 팝업
 *   3. 인증 완료 시 NICE가 returnUrl(서버)로 POST → 서버가 승인·권한부여 후
 *      /billing 으로 redirect
 *
 * 단건결제라 카드를 보관하지 않는다(빌키 없음). 다음 달은 사용자가 다시
 * 결제창을 거친다. 자동갱신(빌키)은 정식오픈 후 별도 도입.
 */

const SDK_SRC = "https://pay.nicepay.co.kr/v1/js/";

declare global {
  interface Window {
    AUTHNICE?: { requestPay: (opts: Record<string, unknown>) => void };
  }
}

function loadNiceSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.AUTHNICE) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("SDK load error")), { once: true });
      if (window.AUTHNICE) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("SDK load error"));
    document.head.appendChild(s);
  });
}

export function NiceCheckout({
  locale,
  planSlug,
  planName,
  cycle,
}: {
  locale: string;
  planSlug: "starter" | "growth";
  planName: string;
  cycle: "monthly" | "annual";
}) {
  const isKo = locale === "ko";
  const [stage, setStage] = useState<"loading" | "opening" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const start = async () => {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/billing/nice/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planSlug, cycle, locale }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j.detail && JSON.stringify(j.detail)) || j.error || "checkout_init_failed");
      }
      const params = (await res.json()) as {
        clientId: string;
        method: string;
        orderId: string;
        amount: number;
        goodsName: string;
        returnUrl: string;
      };

      await loadNiceSdk();
      if (!window.AUTHNICE) throw new Error("AUTHNICE_unavailable");

      setStage("opening");
      window.AUTHNICE.requestPay({
        clientId: params.clientId,
        method: params.method,
        orderId: params.orderId,
        amount: params.amount,
        goodsName: params.goodsName,
        returnUrl: params.returnUrl,
        // 인증 실패/사용자 취소 시 호출되는 콜백. 결제창은 실패해도 페이지를
        // 떠나지 않으므로 여기서 에러 상태로 전환해 재시도 버튼을 보인다.
        fnError: (result: { errorMsg?: string; resultMsg?: string }) => {
          setError(result?.errorMsg || result?.resultMsg || (isKo ? "결제가 취소되었습니다." : "Payment was canceled."));
          setStage("error");
        },
      });
    } catch (err) {
      console.error("[nice checkout]", err);
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
            ({cycle === "annual" ? (isKo ? "연간" : "Annual") : isKo ? "월간" : "Monthly"} · KRW)
          </span>
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          {isKo
            ? "나이스페이먼츠 결제창을 여는 중입니다. 카드 결제 후 자동으로 돌아옵니다."
            : "Opening the NICE Payments window. You'll return here after paying."}
        </p>

        {(stage === "loading" || stage === "opening") && (
          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin text-brand" />
            <span>{isKo ? "결제창 준비 중..." : "Preparing checkout..."}</span>
          </div>
        )}

        {stage === "error" && (
          <div className="text-left">
            <div className="flex items-start gap-2 rounded-md bg-risk-soft/40 border border-risk/20 px-3 py-2.5 text-sm text-slate-700 mb-4">
              <AlertCircle size={16} className="text-risk shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">{isKo ? "결제 시작 실패" : "Could not start checkout"}</div>
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
              <Link href="/plans" className="btn-secondary inline-flex items-center justify-center gap-1.5">
                <ArrowLeft size={14} />
                {isKo ? "플랜 다시 선택" : "Choose plan"}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {isKo ? "계속 안 되면 " : "If this keeps failing, "}
              <a href="mailto:contact@markettwin.ai" className="text-brand hover:underline inline-flex items-center gap-1">
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
