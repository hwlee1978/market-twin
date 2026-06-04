"use client";

import { useState } from "react";

interface Props {
  projectId: string;
  recommendationCountry: string | null;
  recommendationConfidence: "STRONG" | "MODERATE" | "WEAK" | null;
  locale: string;
}

/**
 * Outcome feedback CTA — small badge near the recommendation that lets
 * the user submit their actual launch outcome. Opens an inline modal
 * with a minimal form (status / country / date / notes). Powers the
 * outcome_feedback corpus that drives production accuracy KPI.
 *
 * Designed to be unobtrusive but visible — sits next to "Share" /
 * "Guide" buttons in the EnsembleView header.
 */
export function OutcomeFeedbackCTA({
  projectId,
  recommendationCountry,
  recommendationConfidence,
  locale,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState<
    "planning" | "launched" | "pivoted" | "abandoned"
  >("launched");
  const [country, setCountry] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [notes, setNotes] = useState("");

  const isKo = locale === "ko";

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const requiresCountry = status === "launched" || status === "pivoted";
      if (requiresCountry && country.length !== 2) {
        setError(isKo ? "ISO-2 국가 코드 (예: US, JP)" : "ISO-2 country code");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          launchStatus: status,
          launchCountry: requiresCountry ? country.toUpperCase() : null,
          launchDate: launchDate || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "submit failed");
        setBusy(false);
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        {isKo ? "✓ 런칭 결과 제출 완료" : "✓ Outcome submitted"}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition"
        title={
          isKo
            ? "이 프로젝트를 실제로 런칭했나요? 결과를 공유하면 시스템 정확도 향상에 기여합니다."
            : "Launched this? Share outcome to improve system accuracy."
        }
      >
        📣 {isKo ? "런칭 결과 공유" : "Share launch outcome"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">
            {isKo ? "런칭 결과 공유" : "Share launch outcome"}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 text-sm"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          {isKo
            ? "이 프로젝트로 실제 진행한 결과를 알려주세요. 시스템 추천과 비교해 production accuracy KPI 를 측정합니다. 모든 항목은 본인 워크스페이스에만 저장됩니다."
            : "Tell us what you actually did with this project. We compare it to the sim recommendation to measure production accuracy. All data stays in your workspace."}
        </p>
        {recommendationCountry && (
          <div className="text-[11px] px-2 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
            {isKo ? "시뮬 추천: " : "Sim recommended: "}
            <strong>{recommendationCountry}</strong>
            {recommendationConfidence && (
              <span className="ml-1 text-slate-500">
                ({recommendationConfidence})
              </span>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            {isKo ? "런칭 상태" : "Launch status"}
          </span>
          <select
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value as
                  | "planning"
                  | "launched"
                  | "pivoted"
                  | "abandoned",
              )
            }
            className="input mt-1"
          >
            <option value="planning">
              {isKo ? "계획 중 (아직 런칭 안 함)" : "Planning (not launched yet)"}
            </option>
            <option value="launched">
              {isKo ? "런칭 완료" : "Launched"}
            </option>
            <option value="pivoted">
              {isKo ? "런칭했지만 다른 시장으로 피벗" : "Launched then pivoted"}
            </option>
            <option value="abandoned">
              {isKo ? "포기 / 진행 안 함" : "Abandoned"}
            </option>
          </select>
        </label>

        {(status === "launched" || status === "pivoted") && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                {isKo ? "실제 런칭 국가 (ISO-2)" : "Actual launch country (ISO-2)"}
              </span>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                placeholder="US"
                maxLength={2}
                className="input mt-1 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                {isKo ? "런칭 날짜 (선택)" : "Launch date (optional)"}
              </span>
              <input
                type="date"
                value={launchDate}
                onChange={(e) => setLaunchDate(e.target.value)}
                className="input mt-1"
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            {isKo
              ? "메모 (선택) — 어떤 채널·전략으로? 시스템 추천과 차이가 났다면 왜?"
              : "Notes (optional) — What channels/strategy? Why diverge from the sim?"}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="input mt-1 text-sm"
          />
        </label>

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-ghost text-sm"
            disabled={busy}
          >
            {isKo ? "취소" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary text-sm"
          >
            {busy
              ? isKo
                ? "제출 중..."
                : "Submitting..."
              : isKo
                ? "제출"
                : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
