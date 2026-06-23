"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Sparkles,
  Check,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  Wand2,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  type OnboardingState,
} from "@/lib/mrai/config/onboarding-spec";

type ChatItem =
  | { role: "assistant"; stepId: OnboardingStepId; text: string }
  | { role: "user"; stepId: OnboardingStepId; text: string; isPlaceholder?: boolean };

type Props = {
  initialState: OnboardingState;
};

/**
 * Chat-style guided interview. Renders prior answered steps as
 * (assistant question → user answer) pairs, then the current question
 * + textarea. Auto-scrolls to the bottom as new turns appear.
 *
 * On completion the panel collapses into a "온보딩 완료" card with a
 * "다시 시작" button (owner only — API enforces) and a hint pointing at
 * the Briefing tab below.
 */
export function OnboardingPanel({ initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(initialState);
  const [draft, setDraft] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [resetting, startReset] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autoSeedOpen, setAutoSeedOpen] = useState(false);
  const [autoSeedResult, setAutoSeedResult] = useState<AutoSeedResultData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const history = useMemo<ChatItem[]>(() => {
    const turns: ChatItem[] = [];
    for (const stepId of state.answeredSteps) {
      const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
      if (!step) continue;
      const body = state.answers?.[stepId]?.trim() ?? "";
      turns.push({ role: "assistant", stepId: step.id, text: step.question });
      turns.push({
        role: "user",
        stepId: step.id,
        text: body || "(저장됨)",
        isPlaceholder: !body,
      });
    }
    return turns;
  }, [state.answeredSteps, state.answers]);

  // Auto-scroll to bottom on history or current-step change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (state.currentStep) {
      textareaRef.current?.focus();
    }
  }, [history.length, state.currentStep, state.currentStep?.id]);

  const submit = (skip: boolean) => {
    if (!state.currentStep) return;
    const answer = skip ? "" : draft.trim();
    if (!skip && !answer) {
      setError("답변을 입력해주세요.");
      return;
    }
    if (!skip && answer.length < 2) {
      setError("조금 더 자세히 알려주세요 (2자 이상).");
      return;
    }
    setError(null);
    startSubmit(async () => {
      const res = await fetch("/api/mrai/onboarding/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stepId: state.currentStep!.id,
          answer,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "required") {
          setError("이 항목은 건너뛸 수 없습니다.");
        } else {
          setError("저장에 실패했습니다. 다시 시도해주세요.");
        }
        return;
      }
      setState(json.state);
      setDraft("");
      // If just finished, refresh server components so Briefing/Chat tabs
      // can pull fresh memories.
      if (json.state.completed) {
        router.refresh();
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(false);
    }
  };

  const handleReset = () => {
    if (!confirm("온보딩을 처음부터 다시 진행할까요? 시드 답변은 모두 삭제됩니다.")) return;
    startReset(async () => {
      const res = await fetch("/api/mrai/onboarding/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setState(json.state);
        setDraft("");
        setError(null);
        router.refresh();
      }
    });
  };

  if (state.completed) {
    return (
      <CompletedCard
        state={state}
        onReset={handleReset}
        resetting={resetting}
        onStateChange={setState}
      />
    );
  }

  const current = state.currentStep;
  const progress = state.answeredSteps.length;

  return (
    <>
    <section className="card overflow-hidden p-0">
      <header className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand text-white shrink-0">
          <Sparkles size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">
            워크스페이스 온보딩
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mr. AI가 8가지 항목을 차례로 여쭤봅니다. 답할수록 Briefing과 Chat 정확도가 올라갑니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoSeedOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 rounded-md shrink-0"
          title="회사명만 입력하면 AI가 8단계 답변을 자동 시드합니다"
        >
          <Wand2 size={13} />
          AI Auto-Seed
        </button>
        <div className="text-xs font-semibold text-brand tabular-nums shrink-0">
          {progress} / {state.totalSteps}
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-5 pt-3">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-500"
            style={{ width: `${(progress / state.totalSteps) * 100}%` }}
          />
        </div>
        <StepRail current={current?.id} answered={state.answeredSteps} />
      </div>

      {/* Chat scroll area */}
      <div
        ref={scrollRef}
        className="px-5 py-4 space-y-3 overflow-y-auto"
        style={{ maxHeight: "320px" }}
      >
        {history.map((turn, i) => (
          <ChatBubble key={`${turn.stepId}-${turn.role}-${i}`} item={turn} />
        ))}
        {current && (
          <ChatBubble
            item={{ role: "assistant", stepId: current.id, text: current.question }}
            highlight
          />
        )}
      </div>

      {/* Input dock */}
      {current && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{current.icon}</span>
            <span className="text-xs font-semibold text-slate-700">
              {current.shortLabel}
            </span>
            {current.required ? (
              <span className="text-[10px] uppercase tracking-wider text-red-500">
                필수
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                선택
              </span>
            )}
            <span className="text-[10px] text-slate-400 ml-auto">
              예) {current.example}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={current.placeholder}
            disabled={submitting}
            rows={3}
            className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
          />
          {error && (
            <div className="text-xs text-red-600 mt-1.5">{error}</div>
          )}
          <div className="flex items-center justify-between mt-3 gap-3">
            <span className="text-[11px] text-slate-400">
              ⌘/Ctrl + Enter로 전송
            </span>
            <div className="flex items-center gap-2">
              {!current.required && (
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={submitting}
                  className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2"
                >
                  건너뛰기
                </button>
              )}
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting || !draft.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-white rounded-md hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "저장 중..." : "다음"}
                {!submitting && <ArrowRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    {autoSeedOpen && (
      <AutoSeedModal
        onClose={() => setAutoSeedOpen(false)}
        onCompleted={(result) => {
          setAutoSeedOpen(false);
          setAutoSeedResult(result);
          setState(result.state);
          router.refresh();
        }}
      />
    )}
    {autoSeedResult && (
      <AutoSeedResultBanner
        result={autoSeedResult}
        onDismiss={() => setAutoSeedResult(null)}
      />
    )}
    </>
  );
}

type AutoSeedDraft = {
  stepId: OnboardingStepId;
  shortLabel: string;
  body: string;
  needsReview: boolean;
};

type AutoSeedResultData = {
  answers: AutoSeedDraft[];
  sourceUrls: string[];
  costEstimateUsd: number;
  savedSteps: OnboardingStepId[];
  state: OnboardingState;
  errors: Array<{ stepId: OnboardingStepId; error: string }>;
};

function AutoSeedModal({
  onClose,
  onCompleted,
}: {
  onClose: () => void;
  onCompleted: (result: AutoSeedResultData) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"idle" | "searching" | "synthesizing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setSubmitting(true);
    setError(null);
    setStage("searching");
    // We can't truly observe server stages, but advancing the label
    // every ~12s gives the user a sense of progress instead of one
    // long opaque spinner.
    const stage1 = setTimeout(() => setStage("synthesizing"), 12000);
    const stage2 = setTimeout(() => setStage("saving"), 30000);
    try {
      const res = await fetch("/api/mrai/onboarding/auto-seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          websiteUrl: websiteUrl.trim() || undefined,
          extraContext: extraContext.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          typeof json.detail === "string"
            ? json.detail
            : typeof json.error === "string"
            ? json.error
            : "Auto-Seed에 실패했습니다.",
        );
        return;
      }
      onCompleted({
        answers: json.answers,
        sourceUrls: json.sourceUrls ?? [],
        costEstimateUsd: json.costEstimateUsd ?? 0,
        savedSteps: json.savedSteps ?? [],
        state: json.state,
        errors: json.errors ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      clearTimeout(stage1);
      clearTimeout(stage2);
      setSubmitting(false);
      setStage("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {!submitting && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
            aria-label="close"
          >
            <X size={18} />
          </button>
        )}
        <div className="flex items-center gap-2 mb-1">
          <Wand2 size={18} className="text-violet-600" />
          <h2 className="text-base font-semibold text-slate-900">AI Auto-Seed</h2>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          회사명만 입력하면 Mr. AI가 웹 리서치 + LLM 합성으로 8단계 답변을 자동 작성합니다 (45초~2분, ~$0.10~0.30).
        </p>

        <form onSubmit={submit} className="space-y-3">
          <Field
            label="회사명"
            value={companyName}
            onChange={setCompanyName}
            placeholder="예: 자사 또는 클라이언트 브랜드명"
            required
            disabled={submitting}
            autoFocus
          />
          <Field
            label="회사 웹사이트 (선택)"
            value={websiteUrl}
            onChange={setWebsiteUrl}
            placeholder="https://yourbrand.com"
            disabled={submitting}
          />
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              추가 컨텍스트 (선택, 최대 6000자)
            </span>
            <textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="회사 소개서 발췌, About 페이지 내용, 사업계획서 요약 등 — 정확도를 크게 높입니다"
              disabled={submitting}
              rows={4}
              className="mt-1 w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-500 resize-none"
            />
          </label>

          {submitting && (
            <div className="bg-violet-50 border border-violet-200 rounded-md p-3 text-xs text-violet-700 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {stage === "searching" && "웹 리서치 진행 중 (Tavily 5-각도 검색)..."}
              {stage === "synthesizing" && "LLM이 8단계 답변 합성 중..."}
              {stage === "saving" && "메모리 저장 중..."}
              {stage === "idle" && "준비 중..."}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !companyName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  자동 시드 중...
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  Auto-Seed 시작
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AutoSeedResultBanner({
  result,
  onDismiss,
}: {
  result: AutoSeedResultData;
  onDismiss: () => void;
}) {
  const reviewCount = result.answers.filter((a) => a.needsReview).length;
  const savedCount = result.savedSteps?.length ?? result.answers.length;
  return (
    <section className="card bg-gradient-to-r from-violet-50 to-fuchsia-50 border-violet-200">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600 text-white shrink-0">
          <Wand2 size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">
            🤖 AI가 {savedCount}단계 시드를 작성했습니다
          </h3>
          <p className="text-xs text-violet-700 mt-1 leading-relaxed">
            {reviewCount > 0 ? (
              <>
                {reviewCount}개 항목은 <b>검토가 필요</b>합니다 (외부 검색으로 확인 어려운 본인 KPI·의사결정 등).
                위 진행 카드들에서 각 step의 답변을 확인·수정하시고, 필요한 경우 다시 작성해주세요.
              </>
            ) : (
              <>모든 답변에 검색 근거가 있습니다. 위 진행 카드에서 검토만 마쳐주세요.</>
            )}
            <span className="ml-2 text-[10px] text-violet-500">
              · cost ${result.costEstimateUsd.toFixed(3)}
            </span>
          </p>
          {result.sourceUrls.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-violet-600 cursor-pointer hover:underline">
                출처 {result.sourceUrls.length}개 보기
              </summary>
              <ul className="mt-1.5 space-y-1">
                {result.sourceUrls.slice(0, 8).map((u, i) => (
                  <li key={i} className="text-[11px]">
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:underline inline-flex items-center gap-1 truncate max-w-full"
                    >
                      <ExternalLink size={10} />
                      {u.slice(0, 80)}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-violet-400 hover:text-violet-700"
          aria-label="dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        className="mt-1 w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-500 disabled:bg-slate-50 disabled:text-slate-500"
      />
    </label>
  );
}

function StepRail({
  current,
  answered,
}: {
  current?: OnboardingStepId;
  answered: OnboardingStepId[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 mb-1">
      {ONBOARDING_STEPS.map((s) => {
        const isDone = answered.includes(s.id);
        const isCurrent = current === s.id;
        return (
          <span
            key={s.id}
            className={clsx(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
              isDone && "bg-brand text-white border-brand",
              isCurrent && !isDone && "bg-brand-50 text-brand border-brand/40",
              !isDone && !isCurrent && "bg-white text-slate-400 border-slate-200",
            )}
            title={s.shortLabel}
          >
            {isDone && <Check size={10} />}
            {s.icon} {s.shortLabel}
          </span>
        );
      })}
    </div>
  );
}

function ChatBubble({
  item,
  highlight,
}: {
  item: ChatItem;
  highlight?: boolean;
}) {
  if (item.role === "assistant") {
    return (
      <div className="flex gap-2.5 items-start">
        <span
          className={clsx(
            "inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0",
            highlight ? "bg-brand text-white" : "bg-brand-50 text-brand",
          )}
        >
          <Sparkles size={12} />
        </span>
        <div
          className={clsx(
            "max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm whitespace-pre-wrap leading-relaxed",
            highlight
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-700",
          )}
        >
          {item.text}
        </div>
      </div>
    );
  }
  const needsReview =
    !item.isPlaceholder && /정보\s*부족|검토\s*필요/.test(item.text);
  return (
    <div className="flex justify-end">
      <div
        className={clsx(
          "max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap leading-relaxed border",
          item.isPlaceholder &&
            "bg-emerald-50 text-emerald-700 border-emerald-100 text-xs inline-flex items-center gap-1.5",
          !item.isPlaceholder && needsReview &&
            "bg-amber-50 text-amber-900 border-amber-200",
          !item.isPlaceholder && !needsReview &&
            "bg-slate-50 text-slate-800 border-slate-200",
        )}
      >
        {item.isPlaceholder ? (
          <>
            <CheckCircle2 size={12} />
            {item.text}
          </>
        ) : (
          item.text
        )}
      </div>
    </div>
  );
}

function CompletedCard({
  state,
  onReset,
  resetting,
  onStateChange,
}: {
  state: OnboardingState;
  onReset: () => void;
  resetting: boolean;
  onStateChange: (next: OnboardingState) => void;
}) {
  // Collapsed by default — once onboarded the user usually wants the
  // Briefing/Chat below to be the focus, not the 8-step seed answers
  // taking up a full screen height every refresh.
  const [showAnswers, setShowAnswers] = useState(false);
  const [editingStepId, setEditingStepId] = useState<OnboardingStepId | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewCount = useMemo(() => {
    let n = 0;
    for (const id of state.answeredSteps) {
      const body = state.answers?.[id] ?? "";
      if (/정보\s*부족|검토\s*필요/.test(body)) n++;
    }
    return n;
  }, [state.answeredSteps, state.answers]);

  const startEdit = (stepId: OnboardingStepId) => {
    const body = state.answers?.[stepId] ?? "";
    setEditingStepId(stepId);
    setDraft(/정보\s*부족|검토\s*필요/.test(body) ? "" : body);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingStepId(null);
    setDraft("");
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingStepId) return;
    const trimmed = draft.trim();
    if (trimmed.length < 2) {
      setError("2자 이상 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/onboarding/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: editingStepId, answer: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "저장 실패");
        return;
      }
      onStateChange(json.state);
      setEditingStepId(null);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card overflow-hidden p-0">
      <div className="px-5 py-4 flex items-start gap-3 border-b border-slate-100">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
          <CheckCircle2 size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">
            온보딩 완료
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {state.totalSteps}개 항목 모두 시드됐습니다.
            {reviewCount > 0 && (
              <>
                {" "}
                <span className="text-amber-700 font-medium">
                  {reviewCount}개 항목은 검토 권장 (정보 부족)
                </span>
                . 아래에서 직접 입력하세요.
              </>
            )}
            {state.completedAt && (
              <>
                {" "}
                <span className="text-slate-400" suppressHydrationWarning>
                  · {new Date(state.completedAt).toLocaleString("ko-KR")}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAnswers((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2"
        >
          {showAnswers ? "답변 접기" : "답변 펼치기"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-2 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          {resetting ? "초기화 중..." : "다시 시작"}
        </button>
      </div>
      {showAnswers && (
        <div className="px-5 py-4 space-y-2 max-h-[560px] overflow-y-auto bg-slate-50/30">
          {ONBOARDING_STEPS.map((s) => {
            const body = state.answers?.[s.id]?.trim() ?? "";
            const needsReview = /정보\s*부족|검토\s*필요/.test(body);
            const isEditing = editingStepId === s.id;
            return (
              <div
                key={s.id}
                className={clsx(
                  "border rounded-md px-3 py-2.5",
                  isEditing
                    ? "border-brand bg-white ring-2 ring-brand/20"
                    : needsReview
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{s.icon}</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {s.index + 1} / {s.total} · {s.shortLabel}
                  </span>
                  {needsReview && !isEditing && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-700">
                      검토 필요
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving || !draft.trim()}
                          className="inline-flex items-center gap-1 text-[11px] font-medium bg-brand text-white hover:bg-brand-600 disabled:opacity-50 px-3 py-1 rounded"
                        >
                          {saving ? "저장 중..." : "저장"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(s.id)}
                        className={clsx(
                          "text-[11px] px-2 py-1 rounded",
                          needsReview
                            ? "text-amber-700 hover:text-amber-900 hover:bg-amber-100 font-semibold"
                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        {needsReview ? "+ 답변 입력" : "수정"}
                      </button>
                    )}
                  </div>
                </div>
                {/* Mr. AI의 원래 질문 — 답변만 보면 무엇에 대한 답인지
                    가늠하기 어려우므로 항상 함께 표시. */}
                <div className="flex gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-50 text-brand shrink-0 mt-0.5">
                    <Sparkles size={10} />
                  </span>
                  <p className="flex-1 text-[12px] text-slate-500 leading-relaxed whitespace-pre-wrap">
                    {s.question}
                  </p>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={s.placeholder}
                      disabled={saving}
                      rows={3}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveEdit();
                        }
                      }}
                      className="w-full mt-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400">
                        예) {s.example} · ⌘/Ctrl+Enter 저장
                      </span>
                      {error && (
                        <span className="text-[11px] text-red-600">{error}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0 pt-1 w-5 text-right">
                      답
                    </span>
                    <p
                      className={clsx(
                        "flex-1 text-sm whitespace-pre-wrap leading-relaxed",
                        needsReview ? "text-amber-900" : "text-slate-800",
                      )}
                    >
                      {body || "(빈 답변)"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
