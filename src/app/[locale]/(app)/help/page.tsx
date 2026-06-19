import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { HelpCircle, Mail, ExternalLink } from "lucide-react";

/**
 * Static help / FAQ page. Self-serve answers to the questions that
 * come up repeatedly in early-user feedback (cost, timing, persona
 * count, share links, billing). Kept as a single static page rather
 * than a CMS or knowledge-base for v0.1 — all the answers live in code
 * comments and the wizard hints anyway, this just makes them
 * collectively reachable from a menu link.
 */
export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";

  const faqs = isKo
    ? [
        {
          q: "시뮬레이션은 얼마나 걸리나요?",
          a: "Tier에 따라 다릅니다. 초기검증(Hypothesis)은 약 5~6분, 검증분석(Consensus) 12분, 검증분석 Plus(Consensus Plus) 12-17분, 심층분석(Triangulated) 17-22분. 시뮬 끝나면 이메일로 완료 알림이 옵니다.",
        },
        {
          q: "결과는 얼마나 정확한가요?",
          a: "AI 페르소나 시뮬레이션은 실제 시장조사를 대체하지 않습니다. 가설 검증 + 우선순위 결정에 활용하세요. 페르소나의 거부·신뢰 요인, 채널 추천, 권장가는 LLM 추정치이며, 실제 1차 출시 결과 검증을 위해 100명 small-batch 테스트를 권장합니다.",
        },
        {
          q: "시장 규모(TAM)는 어디서 가져오나요?",
          a: "Tavily 웹 검색 + LLM 합성으로 산출합니다. 결과 페이지에 출처 링크가 노출되며, 시장조사 데이터(Statista, Euromonitor 등)와는 다른 추정치임을 disclaimer로 표시합니다.",
        },
        {
          q: "공유 링크는 어떻게 만들고 누가 볼 수 있나요?",
          a: "결과 페이지 우측 상단 \"공유 링크\" 버튼 → 30일 유효한 URL이 클립보드에 복사됩니다. 링크를 받은 사람은 로그인 없이 read-only로 결과를 볼 수 있습니다 (수정·재실행 불가).",
        },
        {
          q: "여러 LLM이 동시에 분석하는 이유는?",
          a: "단일 모델 편향을 줄이기 위해서입니다. Consensus Plus tier는 Anthropic + OpenAI + DeepSeek 5개씩 균등 분배, Triangulated tier는 25개 sims를 3 provider 라운드로빈합니다. 모델끼리 동일한 시장을 추천하면 단일 모델 한계를 넘는 합의 시그널입니다.",
        },
        {
          q: "결제는 언제 발생하나요?",
          a: "현재 v0.1에서는 결제 시스템이 비활성화되어 있습니다. 가입은 무료 체험으로 진행되며, 향후 Starter / Validator / Growth 플랜 활성화 시 별도 안내드립니다.",
        },
        {
          q: "권장 가격이 입력 가격과 다른 이유는?",
          a: "페르소나는 입력 가격을 기준으로 평가하지만, 권장 가격은 별도 demand curve LLM이 계산합니다. 가격×전환확률 곡선의 매출 최대점이 권장가가 됩니다. 페르소나 신호와 어긋날 수 있으니 실 시장에서 검증 후 조정하세요.",
        },
        {
          q: "PDF 리포트는 두 종류가 있던데 차이는?",
          a: "임원용(Executive)은 4페이지 — 30초 브리핑 + 판정 + 액션 + 가격. 의사결정자가 빠르게 훑어볼 용도. 전체(Detailed)는 28페이지+ — 모든 페르소나 분석, 국가별 드릴다운, 리스크/액션 매핑까지. 분석가용.",
        },
      ]
    : [
        {
          q: "How long does a simulation take?",
          a: "Depends on tier. Hypothesis ~5-6 min, Consensus ~12 min, Consensus Plus 12-17 min, Triangulated 17-22 min. You'll receive an email notification when it completes.",
        },
        {
          q: "How accurate are the results?",
          a: "AI persona simulations are not a replacement for real market research. Use them for hypothesis validation and prioritization. Persona objections, trust factors, channel recommendations, and price suggestions are LLM estimates — validate with a 100-customer pilot before scaling.",
        },
        {
          q: "Where does the TAM (market size) come from?",
          a: "Tavily web search + LLM synthesis. Source citations appear on the result page, with a disclaimer that the figures differ from formal market research (Statista, Euromonitor).",
        },
        {
          q: "How do share links work and who can view them?",
          a: "Click \"Share link\" at the top right of the result page → a 30-day URL is copied to your clipboard. Recipients view a read-only version without signing in (no edit / re-run).",
        },
        {
          q: "Why use multiple LLMs simultaneously?",
          a: "To rule out single-model bias. Consensus Plus tier evenly distributes 5 sims each across Anthropic + OpenAI + DeepSeek; Triangulated tier round-robins 25 sims across 3 providers. When models converge on the same market, you have consensus signal beyond any one model's limits.",
        },
        {
          q: "When am I billed?",
          a: "Billing is disabled in v0.1. Signups run on a free trial; we'll notify you separately when Starter / Validator / Growth plans go live.",
        },
        {
          q: "Why does the recommended price differ from the price I entered?",
          a: "Personas evaluate at your input price, but the recommended price is computed by a separate demand-curve LLM that picks the revenue-max point on the price×conversion curve. The two can disagree — validate in market and adjust before committing.",
        },
        {
          q: "What's the difference between the two PDF report types?",
          a: "Executive is 4 pages — 30-second brief + verdict + actions + pricing. For decision-makers who want a fast scan. Detailed is 28+ pages — full persona analysis, per-country drilldown, risk-action mapping. For analysts.",
        },
      ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isKo ? "도움말" : "Help & FAQ"}
        subtitle={
          isKo
            ? "자주 묻는 질문과 사용 가이드. 답이 없으면 아래 이메일로 연락주세요."
            : "Common questions and usage notes. Reach out via the email below if your question isn't answered here."
        }
      />

      <div className="card p-5 sm:p-6 space-y-5">
        {faqs.map((item, i) => (
          <details
            key={i}
            className="group border-b border-slate-100 last:border-0 pb-4 last:pb-0"
          >
            <summary className="flex items-start gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <HelpCircle
                size={16}
                className="shrink-0 mt-0.5 text-brand group-open:rotate-180 transition-transform"
              />
              <h3 className="text-sm font-semibold text-slate-900 leading-relaxed">
                {item.q}
              </h3>
            </summary>
            <div className="mt-2 ml-7 text-sm text-slate-600 leading-relaxed">
              {item.a}
            </div>
          </details>
        ))}
      </div>

      <div className="card p-5 bg-brand-50/30 border-brand/20">
        <div className="flex items-start gap-3">
          <Mail size={18} className="shrink-0 mt-0.5 text-brand" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              {isKo ? "추가 문의" : "Still have a question?"}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {isKo
                ? "여기에 없는 질문이나 버그 제보는 이메일로 보내주세요. 영업일 기준 24-48시간 내 답변드립니다."
                : "For questions not covered here or to report a bug, email us. We typically reply within 24-48 business hours."}
            </p>
            <a
              href="mailto:contact@markettwin.ai"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline mt-1"
            >
              contact@markettwin.ai
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
