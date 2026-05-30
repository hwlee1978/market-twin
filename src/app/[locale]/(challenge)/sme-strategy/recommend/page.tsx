"use client";

import { useState } from "react";
import { Building2, User, Database } from "lucide-react";
import { RecommendOnlyPanel } from "@/components/challenge/RecommendOnlyPanel";
import { BatchRecommendPanel } from "@/components/challenge/BatchRecommendPanel";

/**
 * Task 1 — 적합 판로 추천 페이지.
 * 두 가지 모드:
 *   - 단건: 폼 입력 → 즉시 추천
 *   - Batch: CSV 업로드 → 일괄 처리 + 결과 CSV 다운로드 + 재현성 검증
 *
 * 챌린지 심사기관이 자체 테스트셋 CSV로 정확도·재현성 직접 측정 가능.
 */
export default function RecommendPage() {
  const [mode, setMode] = useState<"single" | "batch">("single");

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
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

      {/* Mode tabs */}
      <div className="mb-5 flex gap-1.5 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "single"
              ? "border-amber-600 text-amber-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <User className="inline w-3.5 h-3.5 mr-1.5" />
          단건 입력
        </button>
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "batch"
              ? "border-amber-600 text-amber-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Database className="inline w-3.5 h-3.5 mr-1.5" />
          CSV Batch (심사용)
          <span className="ml-1.5 text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
            신규
          </span>
        </button>
      </div>

      {mode === "single" ? <RecommendOnlyPanel /> : <BatchRecommendPanel />}

      <aside className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 leading-relaxed">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">알고리즘</h3>
        <ol className="space-y-1 list-decimal list-inside">
          <li>
            <strong>Stage 1</strong> — pgvector cosine similarity: 입력 임베딩 vs 사업 임베딩 Top-30
          </li>
          <li>
            <strong>Stage 2</strong> — Claude Sonnet rerank: 입력 컨텍스트 + 후보 보고 Top-K 선정 +
            한국어 이유
          </li>
          <li>
            <strong>재현성 키</strong> — 입력 정규화 후 SHA-256 → input_hash. 동일 입력 → 동일 hash →
            동일 결과 (temperature 0 + cache)
          </li>
          <li>
            <strong>Batch 모드</strong> — CSV 업로드 → 동시 2-workers 처리 → 결과 CSV + 재현성 자동
            검증 (2회차 input_hash 일치 비교)
          </li>
        </ol>
      </aside>
    </div>
  );
}
