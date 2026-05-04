"use client";

import { useState } from "react";
import { HelpCircle, ChevronRight, X, Lightbulb } from "lucide-react";
import Link from "next/link";

/**
 * Dashboard "Guide" button — sits in PageHeader actions next to "+ 새 프로젝트".
 * Opens a quick 3-step orientation modal explaining how to navigate the app.
 * Distinct from the WelcomeModal in EnsembleView (that one walks through
 * tabs that only exist on the result page); this one explains the
 * dashboard → project → result → export flow.
 *
 * Always callable — has no dismissal state, just a stateless "show me again"
 * trigger. Keeps the same visual idiom (HelpCircle icon + 3 numbered cards)
 * as the EnsembleView welcome modal so users get the same affordance shape
 * across the product.
 */
export function DashboardGuideButton({
  isKo,
  hasProjects,
  demoToken,
}: {
  isKo: boolean;
  hasProjects: boolean;
  demoToken?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost text-sm inline-flex items-center gap-1.5"
        title={isKo ? "사용법 가이드" : "How to use"}
        aria-label={isKo ? "사용법 가이드" : "How to use"}
      >
        <HelpCircle size={14} />
        <span>{isKo ? "도움말" : "Guide"}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label={isKo ? "닫기" : "Close"}
            >
              <X size={18} />
            </button>

            <div className="text-xs uppercase tracking-wider text-accent-600 font-semibold mb-1">
              {isKo ? "Market Twin 사용법" : "How Market Twin works"}
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-1">
              {isKo ? "3단계로 시작하기" : "Three steps to get going"}
            </h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              {isKo
                ? "처음이시면 이 순서대로 해보세요. 각 카드에서 바로 시작할 수 있습니다."
                : "First time here? Try these steps in order. Each card is a direct entry point."}
            </p>

            <div className="space-y-2 mb-6">
              <GuideStep
                num={1}
                title={
                  hasProjects
                    ? isKo
                      ? "새 프로젝트 만들기"
                      : "Start a new project"
                    : isKo
                      ? "데모로 5초 만에 결과 보기"
                      : "See a demo result in 5 seconds"
                }
                desc={
                  hasProjects
                    ? isKo
                      ? "제품 정보·후보 시장·가격을 입력하면 AI 페르소나가 시장별 출시 점수를 산출합니다."
                      : "Enter product, candidate markets, and price — AI personas score launch viability per market."
                    : isKo
                      ? "가입 없이 실제 분석 리포트를 즉시 확인. 데모를 본 후 새 프로젝트를 만들어 보세요."
                      : "View a real analysis report without signup, then create your own project."
                }
                href={hasProjects ? "/projects/new" : demoToken ? "/demo" : "/projects/new"}
                onClick={() => setOpen(false)}
              />
              <GuideStep
                num={2}
                title={isKo ? "결과 페이지에서 차트 읽기" : "Read the result page"}
                desc={
                  isKo
                    ? "각 차트 아래 \"이 차트 어떻게 읽나요?\" 링크를 클릭하면 임계값·해석법이 펼쳐집니다."
                    : "Each chart has a \"How to read this chart\" expander with thresholds and interpretation tips."
                }
                href={hasProjects ? "/projects" : undefined}
                onClick={() => setOpen(false)}
              />
              <GuideStep
                num={3}
                title={isKo ? "PDF 리포트 / 공유 / CSV" : "Export PDF / share / CSV"}
                desc={
                  isKo
                    ? "결과 페이지 우측 상단에서 임원용 PDF, 가입 없이 볼 수 있는 공유 링크, 표 데이터 CSV를 받을 수 있습니다."
                    : "From the result page header: executive PDF, public share link (no signup needed), and table data as CSV."
                }
                href={hasProjects ? "/projects" : undefined}
                onClick={() => setOpen(false)}
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-md bg-accent-50 border border-accent-200 px-3.5 py-3 mb-4">
              <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent mb-1">
                  {isKo ? "팁" : "Tip"}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed m-0">
                  {isKo
                    ? "결과 페이지 헤더의 \"도움말\" 버튼으로 차트 해석 가이드를 언제든 다시 볼 수 있습니다."
                    : "The \"Guide\" button on every result page re-opens the chart-interpretation tour any time."}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-primary text-sm"
              >
                {isKo ? "확인" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GuideStep({
  num,
  title,
  desc,
  href,
  onClick,
}: {
  num: number;
  title: string;
  desc: string;
  href?: string;
  onClick: () => void;
}) {
  const inner = (
    <>
      <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
        {num}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</span>
      </span>
      {href && <ChevronRight size={16} className="text-slate-400 mt-1 shrink-0" />}
    </>
  );
  const baseClass =
    "w-full text-left flex items-start gap-3 rounded-lg border border-slate-200 hover:border-accent-300 hover:bg-accent-50/40 transition-colors p-3";
  if (href) {
    return (
      <Link href={href} className={baseClass} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}
