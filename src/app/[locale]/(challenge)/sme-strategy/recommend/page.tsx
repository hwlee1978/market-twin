import { Building2 } from "lucide-react";
import { RecommendOnlyPanel } from "@/components/challenge/RecommendOnlyPanel";

export const dynamic = "force-dynamic";

/**
 * Task 1 — 적합 판로 추천 페이지.
 * 챌린지 응모/심사용 단순 입력 → 매칭 결과만 표시.
 */
export default function RecommendPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      <header className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase rounded mb-2">
          Task 1
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-amber-600" />
          적합 판로 추천
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          기업·제품 정보 → <strong>판판대로 90개 지원사업 + 수출바우처 5.8만 프로그램</strong> 중 Top-K
          자동 매칭. 매칭 이유 + 적합도 점수 + 재현성 키 제공.
        </p>
      </header>

      <RecommendOnlyPanel />

      <aside className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 leading-relaxed">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">알고리즘</h3>
        <ol className="space-y-1 list-decimal list-inside">
          <li>
            <strong>Stage 1</strong> — pgvector cosine similarity: 입력 임베딩 vs 사업 임베딩 Top-30 (내수
            + 수출 각각)
          </li>
          <li>
            <strong>Stage 2</strong> — Claude Sonnet rerank: 입력 기업 컨텍스트 + 후보 사업 정보 동시 보고
            Top-K 선정 + 한국어 이유 생성
          </li>
          <li>
            <strong>재현성</strong> — 입력 정규화 후 SHA-256 해시 → ch_recommendations.input_hash. 동일
            입력 → 동일 출력 보장 (temperature 0)
          </li>
          <li>
            <strong>평가 분리</strong> — dataset_split 컬럼 (train/test/holdout/prod) 으로 학습/테스트
            격리. 심사기관 자체 테스트셋 평가 시 'test' 표시.
          </li>
        </ol>
      </aside>
    </div>
  );
}
