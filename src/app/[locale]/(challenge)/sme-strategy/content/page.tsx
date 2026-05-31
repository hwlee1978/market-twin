import { FileText } from "lucide-react";
import { ContentOnlyPanel } from "@/components/challenge/ContentOnlyPanel";

export const dynamic = "force-dynamic";

/**
 * Task 2 — 마케팅 콘텐츠 제작 페이지. 챌린지 정의 3 산출물:
 *   ① 시장분석 리포트
 *   ② 다국어 상품 기술서 (5개국어)
 *   ③ 홍보영상 콘텐츠 + 상세페이지 (Kling v1.6 Pro + e-commerce mockup)
 */
export default function ContentPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      <header className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold uppercase rounded mb-2">
          Task 2
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-sky-600" />
          마케팅 콘텐츠 제작
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          제품 정보 → 챌린지 정의 <strong>3 산출물 자동 생성</strong>. ① 시장분석 리포트 +
          ② 다국어 상품 기술서 (5개국어) + ③ 홍보영상 콘텐츠 + 상세페이지 통합 (Kling v1.6 Pro).
        </p>
      </header>

      <ContentOnlyPanel />

      <aside className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 leading-relaxed">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">생성 비용·시간</h3>
        <table className="w-full text-xs">
          <thead className="text-slate-500 text-[10px] uppercase">
            <tr>
              <th className="text-left py-1">산출물</th>
              <th className="text-left">모델</th>
              <th className="text-right">시간</th>
              <th className="text-right">비용</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            <tr className="border-t border-slate-200">
              <td className="py-1">① 시장분석 리포트</td>
              <td>Claude Sonnet 4.6</td>
              <td className="text-right">~30초</td>
              <td className="text-right">~$0.04</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1">② 다국어 상품 기술서 (5개국어)</td>
              <td>Claude Sonnet 4.6 (jsonSchema)</td>
              <td className="text-right">~40초</td>
              <td className="text-right">~$0.06</td>
            </tr>
            <tr className="border-t border-slate-100 bg-violet-50/40">
              <td className="py-1">AI 윤문 자동 적용 (①·② 후처리)</td>
              <td>Humanize KR (im-not-ai 룰북, Sonnet 4.6)</td>
              <td className="text-right">+~60초</td>
              <td className="text-right">+~$0.07</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1 pl-3 text-slate-600">└ ③-a 상세페이지 (즉시 렌더)</td>
              <td className="text-slate-600">다국어 기술서 결합 + UI 렌더</td>
              <td className="text-right text-slate-600">즉시</td>
              <td className="text-right text-slate-600">$0</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1 pl-3 text-slate-600">└ ③-b Tier A · 단일 클립 (5초 / 10초)</td>
              <td className="text-slate-600">Kling v1.6 Pro + smart motion (Haiku)</td>
              <td className="text-right text-slate-600">~2-4분</td>
              <td className="text-right text-slate-600">$0.50 / $1.00</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1 pl-3 text-slate-600">└ ③-b Tier B · 3-scene 스토리보드 (5초 / 10초)</td>
              <td className="text-slate-600">Kling × 3 sequential (11s 간격, 429 회피)</td>
              <td className="text-right text-slate-600">~4-7분</td>
              <td className="text-right text-slate-600">$1.50 / $3.00</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1 pl-3 text-slate-600">└ ③-b Tier C · + TTS (5초 / 10초)</td>
              <td className="text-slate-600">Tier B + OpenAI TTS Nova (한국어)</td>
              <td className="text-right text-slate-600">~5-8분</td>
              <td className="text-right text-slate-600">~$1.50 / ~$3.00</td>
            </tr>
            <tr className="border-t border-slate-100 font-medium">
              <td className="py-1">③ 홍보영상 + 상세페이지 통합 (챌린지 정의)</td>
              <td className="text-slate-500 text-[10px]">상세페이지 hero에 Tier A/B/C 영상 재생</td>
              <td className="text-right">~2-7분</td>
              <td className="text-right">~$0.50-2.00</td>
            </tr>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1.5">합계 (영상 포함)</td>
              <td colSpan={2} className="text-right">~4-6분</td>
              <td className="text-right">~$0.67</td>
            </tr>
          </tbody>
        </table>
      </aside>
    </div>
  );
}
