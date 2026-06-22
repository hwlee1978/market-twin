"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Loader2, AlertCircle, Lock, ArrowLeft } from "lucide-react";

/**
 * 나이스페이먼츠(V2 키인) 카드입력 폼. 포스타트는 결제창에서 빌키를 발급하지
 * 않으므로(NICE 답변 2026-06-22), Toss처럼 호스팅 페이지로 redirect 하지 않고
 * 가맹 자체 폼에서 카드정보를 받아 POST /api/billing/nice/issue 로 보낸다.
 * 서버가 AES 암호화 → 빌키발급 → 첫 과금까지 한 번에 처리한다.
 *
 * 카드정보는 state에만 잠깐 머물고 서버 응답에는 마스킹된 카드명만 돌아온다.
 */
export function NiceCardForm({
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
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // 카드 필드 — digits만 보관. 표시용 포맷팅은 입력 핸들러에서 분리한다.
  const [cardNo, setCardNo] = useState("");
  const [exp, setExp] = useState(""); // MMYY
  const [idNo, setIdNo] = useState(""); // 생년월일6 또는 사업자10
  const [cardPw, setCardPw] = useState(""); // 앞 2자리

  const digits = (s: string) => s.replace(/\D/g, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const no = digits(cardNo);
    const expDigits = digits(exp);
    const expMonth = expDigits.slice(0, 2);
    const expYear = expDigits.slice(2, 4);

    const fail = (msg: string) => {
      setError(msg);
      setStage("error");
    };
    if (!/^\d{15,16}$/.test(no)) return fail(isKo ? "카드번호를 확인해주세요." : "Check the card number.");
    if (!/^(0[1-9]|1[0-2])$/.test(expMonth) || expYear.length !== 2)
      return fail(isKo ? "유효기간(MM/YY)을 확인해주세요." : "Check the expiry (MM/YY).");
    if (!/^\d{6,10}$/.test(digits(idNo)))
      return fail(isKo ? "생년월일 6자리(개인) 또는 사업자번호 10자리를 입력해주세요." : "Enter birthdate (6) or business no. (10).");
    if (!/^\d{2}$/.test(digits(cardPw)))
      return fail(isKo ? "카드 비밀번호 앞 2자리를 입력해주세요." : "Enter the first 2 digits of the card password.");

    setStage("submitting");
    try {
      const res = await fetch("/api/billing/nice/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: { cardNo: no, expYear, expMonth, idNo: digits(idNo), cardPw: digits(cardPw) },
          plan: planSlug,
          cycle,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j.detail === "string" ? j.detail : (j.error as string) ?? "issue_failed",
        );
      }
      // 성공 — 카드정보 state를 즉시 비우고 결제 대시보드로 이동.
      // router.refresh()로 SSR 캐시를 비워 첫 페인트에 새 플랜이 반영되게
      // 한다(Toss success 흐름과 동일).
      setCardNo("");
      setExp("");
      setIdNo("");
      setCardPw("");
      router.replace("/billing");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  };

  const busy = stage === "submitting";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <form onSubmit={submit} className="card max-w-md w-full p-7">
        <div className="text-xs uppercase tracking-[0.15em] text-brand font-semibold mb-2">
          {isKo ? "카드 등록" : "Card registration"}
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">
          {planName}{" "}
          <span className="text-base font-normal text-slate-500">
            ({cycle === "annual" ? (isKo ? "연간" : "Annual") : isKo ? "월간" : "Monthly"} · KRW)
          </span>
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          {isKo
            ? "정기결제를 위해 카드를 등록합니다. 등록 즉시 첫 결제가 진행됩니다."
            : "Register a card for recurring billing. The first charge runs immediately."}
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{isKo ? "카드번호" : "Card number"}</span>
            <input
              inputMode="numeric"
              autoComplete="cc-number"
              maxLength={19}
              value={cardNo}
              onChange={(e) => setCardNo(e.target.value)}
              placeholder="0000 0000 0000 0000"
              className="input mt-1 w-full tracking-wider"
              disabled={busy}
            />
          </label>

          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="text-xs font-medium text-slate-600">{isKo ? "유효기간 (MM/YY)" : "Expiry (MM/YY)"}</span>
              <input
                inputMode="numeric"
                autoComplete="cc-exp"
                maxLength={5}
                value={exp}
                onChange={(e) => setExp(e.target.value)}
                placeholder="MM/YY"
                className="input mt-1 w-full"
                disabled={busy}
              />
            </label>
            <label className="block w-32">
              <span className="text-xs font-medium text-slate-600">{isKo ? "비밀번호 앞2자리" : "PW (first 2)"}</span>
              <input
                inputMode="numeric"
                type="password"
                maxLength={2}
                value={cardPw}
                onChange={(e) => setCardPw(e.target.value)}
                placeholder="••"
                className="input mt-1 w-full"
                disabled={busy}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              {isKo ? "생년월일 6자리 (개인) / 사업자번호 10자리" : "Birthdate (6) / Business no. (10)"}
            </span>
            <input
              inputMode="numeric"
              maxLength={10}
              value={idNo}
              onChange={(e) => setIdNo(e.target.value)}
              placeholder={isKo ? "YYMMDD 또는 사업자번호" : "YYMMDD or business no."}
              className="input mt-1 w-full"
              disabled={busy}
            />
          </label>
        </div>

        {stage === "error" && error && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-risk-soft/40 border border-risk/20 px-3 py-2.5 text-sm text-slate-700">
            <AlertCircle size={16} className="text-risk shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">{isKo ? "결제 실패" : "Payment failed"}</div>
              <div className="text-xs text-slate-600 break-words">{error}</div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {isKo ? "결제 처리 중..." : "Processing..."}
            </>
          ) : (
            <>
              <Lock size={14} />
              {isKo ? "카드 등록 후 결제" : "Register & pay"}
            </>
          )}
        </button>

        <div className="mt-4 flex items-center justify-between">
          <Link href="/plans" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
            <ArrowLeft size={12} />
            {isKo ? "플랜 다시 선택" : "Choose plan"}
          </Link>
          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
            <Lock size={11} />
            {isKo ? "나이스페이먼츠 보안결제" : "Secured by NICE Payments"}
          </span>
        </div>
      </form>
    </div>
  );
}
