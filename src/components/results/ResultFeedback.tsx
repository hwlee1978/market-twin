"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/**
 * Beta micro-survey shown on the ensemble results screen — "was this
 * result useful for your decision?" (1-5) + an optional one-line comment.
 * Loads any existing feedback on mount (so a returning user sees their
 * prior rating instead of an empty form). One submission per ensemble per
 * user; the API upserts.
 */
export function ResultFeedback({ ensembleId }: { ensembleId: string }) {
  const locale = useLocale();
  const isKo = locale !== "en";

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/ensembles/${ensembleId}/feedback`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (d?.feedback) {
          setRating(d.feedback.rating);
          setComment(d.feedback.comment ?? "");
          setDone(true);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [ensembleId]);

  const submit = async () => {
    if (rating < 1 || sending) return;
    setSending(true);
    const res = await fetch(`/api/ensembles/${ensembleId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
    });
    setSending(false);
    if (res.ok) setDone(true);
  };

  // Avoid a flash of the empty form before we know if feedback exists.
  if (!loaded) return null;

  const endLabels = isKo ? ["전혀", "매우 도움"] : ["Not at all", "Very helpful"];

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-sm font-semibold text-slate-800">
        {isKo
          ? "이 결과가 의사결정에 도움이 되나요?"
          : "Was this result useful for your decision?"}
        <span className="ml-2 text-xs font-normal text-accent">
          {isKo ? "베타 피드백" : "Beta feedback"}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => !done && setRating(n)}
            disabled={done}
            aria-label={`${n}/5`}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              rating === n
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"
            } ${done ? "cursor-default" : ""}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{endLabels[0]}</span>
        <span>{endLabels[1]}</span>
      </div>

      {!done ? (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={
              isKo
                ? "한 줄 의견 (선택) — 어떤 점이 도움이 됐거나 아쉬웠나요?"
                : "One-line comment (optional) — what helped or was missing?"
            }
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={rating < 1 || sending}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {sending
              ? isKo
                ? "보내는 중…"
                : "Sending…"
              : isKo
                ? "피드백 보내기"
                : "Send feedback"}
          </button>
        </>
      ) : (
        <div className="mt-3 text-sm text-success">
          {isKo
            ? "피드백 감사합니다 🙏 베타에 큰 도움이 됩니다."
            : "Thanks for the feedback 🙏 It really helps the beta."}
        </div>
      )}
    </div>
  );
}
