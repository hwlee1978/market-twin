"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Check, RotateCcw, ArrowRight, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  type OnboardingState,
} from "@/lib/mrai/onboarding-spec";

type ChatItem =
  | { role: "assistant"; stepId: OnboardingStepId; text: string }
  | { role: "user"; stepId: OnboardingStepId; text: string };

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const history = useMemo<ChatItem[]>(() => {
    const turns: ChatItem[] = [];
    for (const stepId of state.answeredSteps) {
      const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
      if (!step) continue;
      turns.push({ role: "assistant", stepId: step.id, text: step.question });
      turns.push({
        role: "user",
        stepId: step.id,
        text: "(저장됨)",
      });
    }
    return turns;
  }, [state.answeredSteps]);

  // Auto-scroll to bottom on history or current-step change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (state.currentStep) {
      textareaRef.current?.focus();
    }
  }, [history.length, state.currentStep?.id]);

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
      />
    );
  }

  const current = state.currentStep;
  const progress = state.answeredSteps.length;

  return (
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
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] px-3.5 py-2 rounded-2xl rounded-tr-sm text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 inline-flex items-center gap-1.5">
        <CheckCircle2 size={12} />
        {item.text}
      </div>
    </div>
  );
}

function CompletedCard({
  state,
  onReset,
  resetting,
}: {
  state: OnboardingState;
  onReset: () => void;
  resetting: boolean;
}) {
  return (
    <section className="card flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
        <CheckCircle2 size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-slate-900">
          온보딩 완료
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {state.totalSteps}개 항목 모두 시드됐습니다. 이제 아래 Daily Briefing이 르무통 컨텍스트를 반영합니다.
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
        onClick={onReset}
        disabled={resetting}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-2 disabled:opacity-50"
      >
        <RotateCcw size={12} />
        {resetting ? "초기화 중..." : "다시 시작"}
      </button>
    </section>
  );
}
