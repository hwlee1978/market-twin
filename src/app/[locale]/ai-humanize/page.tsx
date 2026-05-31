import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { HumanizePanel } from "@/components/humanize/HumanizePanel";

export const metadata: Metadata = {
  title: "AI 한국어 윤문 도구 (Humanize KR)",
  description:
    "ChatGPT·Claude·Gemini가 쓴 한국어 글에서 AI 특유의 번역체·기계적 구조를 자동 탐지하고 자연스러운 한국어로 재작성합니다. 40+ 패턴 카탈로그 기반.",
};

export default async function AiHumanizePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1100px] mx-auto px-6 py-5">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
              TOOL
            </span>
            <h1 className="text-2xl font-bold text-slate-900">
              AI 한국어 윤문 도구
            </h1>
            <span className="text-sm text-slate-500">Humanize KR</span>
          </div>
          <p className="text-sm text-slate-600">
            ChatGPT·Claude·Gemini가 쓴 한국어 글에서{" "}
            <strong className="text-slate-900">번역체·기계적 구조·과도한 hedging</strong>{" "}
            등 AI 특유 패턴을 탐지하고 자연스러운 한국어로 재작성합니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span>
              · 40+ AI 패턴 카탈로그 (10 categories, S1/S2 심각도)
            </span>
            <span>· 사실·수치·고유명사·인용 100% 보존</span>
            <span>· 등급 A~D 자동 평가</span>
            <a
              href="https://github.com/epoko77-ai/im-not-ai"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
            >
              원본 룰북: epoko77-ai/im-not-ai
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6">
        <HumanizePanel />

        <footer className="mt-12 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
          <p>
            본 도구는{" "}
            <a
              href="https://github.com/epoko77-ai/im-not-ai"
              target="_blank"
              rel="noopener"
              className="underline hover:text-slate-700"
            >
              epoko77-ai/im-not-ai
            </a>{" "}
            (MIT License) 의 Fast Path (monolith) 룰북을 Anthropic Claude API에 이식한
            구현입니다. 학술 인용 (김도훈 2009, 박옥수 2018 등) 기반.
          </p>
          <p className="mt-1">
            v2.0 패턴 — Strict Mode (5-agent pipeline) 는 미구현. 8,000자 초과 시
            원본 repo 직접 사용 권장.
          </p>
        </footer>
      </main>
    </div>
  );
}
