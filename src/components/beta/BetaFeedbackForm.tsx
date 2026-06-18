"use client";

import { useState } from "react";

type Category = "bug" | "idea" | "usability" | "pricing" | "praise" | "other";

/**
 * Public, anonymous beta feedback form for the /beta landing page. Posts to
 * /api/beta-feedback (no auth). Private collection — submitters don't see
 * other people's feedback. `website` is a hidden honeypot for spam bots.
 */
export function BetaFeedbackForm({ isKo }: { isKo: boolean }) {
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const categories: { key: Category; ko: string; en: string }[] = [
    { key: "bug", ko: "버그·오류", en: "Bug" },
    { key: "idea", ko: "기능 제안", en: "Idea" },
    { key: "usability", ko: "사용성", en: "Usability" },
    { key: "pricing", ko: "가격", en: "Pricing" },
    { key: "praise", ko: "칭찬", en: "Praise" },
    { key: "other", ko: "기타", en: "Other" },
  ];

  const submit = async () => {
    if (message.trim().length < 1 || sending) return;
    setSending(true);
    setError(false);
    try {
      const res = await fetch("/api/beta-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-locale": isKo ? "ko" : "en",
        },
        body: JSON.stringify({
          rating: rating > 0 ? rating : undefined,
          category: category ?? undefined,
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          website, // honeypot
        }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="text-2xl">🙏</div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">
          {isKo ? "피드백 감사합니다!" : "Thank you for the feedback!"}
        </h3>
        <p className="mt-2 text-sm text-slate-600 break-keep">
          {isKo
            ? "보내주신 의견은 베타 제품 개선에 소중히 반영하겠습니다."
            : "We'll fold your input straight into the beta. It really helps."}
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setRating(0);
            setCategory(null);
            setMessage("");
            setName("");
            setEmail("");
          }}
          className="mt-5 text-sm font-medium text-brand hover:underline"
        >
          {isKo ? "다른 의견 더 남기기" : "Leave more feedback"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      {/* Rating */}
      <label className="block text-sm font-semibold text-slate-800">
        {isKo ? "전반적인 만족도 (선택)" : "Overall satisfaction (optional)"}
      </label>
      <div className="mt-2 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(rating === n ? 0 : n)}
            aria-label={`${n}/5`}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              rating === n
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Category */}
      <label className="mt-5 block text-sm font-semibold text-slate-800">
        {isKo ? "분류 (선택)" : "Category (optional)"}
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(category === c.key ? null : c.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              category === c.key
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"
            }`}
          >
            {isKo ? c.ko : c.en}
          </button>
        ))}
      </div>

      {/* Message */}
      <label className="mt-5 block text-sm font-semibold text-slate-800">
        {isKo ? "의견" : "Your feedback"}
        <span className="text-accent"> *</span>
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder={
          isKo
            ? "어떤 점이 좋았나요? 무엇이 불편하거나 아쉬웠나요? 바라는 기능이 있나요?"
            : "What worked well? What was confusing or missing? Any feature you'd want?"
        }
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
      />

      {/* Optional contact */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder={isKo ? "이름 (선택)" : "Name (optional)"}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          placeholder={isKo ? "이메일 (선택, 회신용)" : "Email (optional, for follow-up)"}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      {/* Honeypot — visually hidden, off-screen, not tab-focusable */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
        aria-hidden
      />

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {isKo
            ? "전송에 실패했어요. 잠시 후 다시 시도해 주세요."
            : "Couldn't send. Please try again in a moment."}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={message.trim().length < 1 || sending}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {sending
          ? isKo
            ? "보내는 중…"
            : "Sending…"
          : isKo
            ? "피드백 보내기"
            : "Send feedback"}
      </button>
      <p className="mt-3 text-xs text-slate-400 break-keep">
        {isKo
          ? "보내주신 내용은 비공개로 운영팀에만 전달됩니다."
          : "Your submission is private and goes only to our team."}
      </p>
    </div>
  );
}
