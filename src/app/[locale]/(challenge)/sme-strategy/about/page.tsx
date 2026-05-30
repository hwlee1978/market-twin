import { Users, Layers, ShieldCheck, Award, Database, Cpu } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * About — 팀 정보 + 아키텍처 + 검증 거버넌스. 응모서 §11~12 요약.
 */
export default function AboutPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded mb-2">
          About
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-slate-700" />
          팀 · 아키텍처 · 검증 거버넌스
        </h1>
      </header>

      {/* 팀 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-slate-600" />팀
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">법인</div>
            <div className="text-slate-900 font-semibold">㈜미스터에이아이 (Mr.AI Inc.)</div>
            <ul className="mt-1 text-slate-700 text-xs space-y-0.5">
              <li>· 대표이사: 이현우 (Chris Lee)</li>
              <li>· 사업자등록번호: 693-87-03907</li>
              <li>· 통신판매업신고: 제2026-용인수지-2253호</li>
              <li>· 설립: 2026년 5월</li>
              <li>· 주소: 경기도 용인시 수지구 죽전로27번길 14-30, 604-803호</li>
              <li>· 도메인: <a href="https://markettwin.ai" target="_blank" rel="noopener" className="text-slate-900 underline">markettwin.ai</a> (운영 중)</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">제품</div>
            <div className="text-slate-900 font-semibold">AI Market Twin</div>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              24개국 정부 OpenData (27개 통계 시드)에 그라운딩된 AI 페르소나 시뮬레이션 SaaS.
              한국 수출기업의 해외 진출 성공 확률을 90초 안에 예측. 운영 중인 상용 서비스.
            </p>
            <div className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">파트너십</div>
            <ul className="text-slate-700 text-xs space-y-0.5">
              <li>· AWS Activate · Google for Startups Cloud</li>
              <li>· Supabase Free Tier · Vercel Pro</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 아키텍처 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-600" />아키텍처
        </h2>
        <div className="space-y-3 text-sm">
          <ArchLayer
            num="1"
            title="Data Ingestion"
            icon={Database}
            items={[
              "판판대로 CSV (지원사업 + 선정기업 + 제품) → Postgres + pgvector",
              "수출바우처 Excel (프로그램 + 수출성과) → 동일",
              "사업자등록번호 SHA-256 비식별화",
              "재실행 가능 (idempotent ingestion script)",
            ]}
          />
          <ArchLayer
            num="2"
            title="Recommendation Engine"
            icon={Cpu}
            items={[
              "Stage 1 — pgvector cosine similarity (text-embedding-3-small, 1536 dims)",
              "Stage 2 — Claude Sonnet 4.6 rerank + 한국어 이유 생성 (temperature 0)",
              "Stage 0 (확장 가능) — 협업 필터링 (유사 선정기업 → 그들의 선정 사업)",
              "재현성: input 정규화 → SHA-256 → ch_recommendations.input_hash",
            ]}
          />
          <ArchLayer
            num="3"
            title="Content Generators"
            icon={Layers}
            items={[
              "시장분석 리포트: Claude Sonnet 4.6 + jsonSchema 강제 JSON",
              "다국어 기술서 (5개국어): 동일 + K-name localization 규칙 (TW/CN 중문명+로마자)",
              "홍보영상: Kling v1.6 Pro (Replicate) → Supabase Storage 영구 보존",
              "상세페이지: spec 결합 + 시장별 e-commerce mockup UI",
            ]}
          />
          <ArchLayer
            num="4"
            title="Storage + Governance"
            icon={ShieldCheck}
            items={[
              "Postgres (Supabase 서울 리전 · AES-256 at rest · TLS 1.3 in transit)",
              "Row-Level Security (workspace 격리)",
              "감사 로그 5년 보관 후 익명화",
              "챌린지 데이터: reference 테이블 (RLS off, service-role write only, all-user read)",
            ]}
          />
        </div>
      </section>

      {/* 검증 거버넌스 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-slate-600" />검증 거버넌스
        </h2>
        <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <p>
            <strong>예측 정확도</strong> — validation_dataset_v0 자동 스코어링 파이프라인 (2026-05-15
            ship). Phase E·F 6주 closure benchmark 시스템. 학습/테스트 분리 + Hit@K · MRR · NDCG 측정
            가능 인프라.
          </p>
          <p>
            <strong>재현성</strong> — 모든 추천 실행은 input_hash + model_version + dataset_split 컬럼
            저장. 동일 input → 동일 output 보장 (temperature 0 + cache).
          </p>
          <p>
            <strong>외부 데이터 통합 검증 실적 (Phase F)</strong> — Comtrade · 관세청 UNI-PASS · DART ·
            KOTRA · MFDS · KOSIS · Hofstede · World Bank · BoJ 9개 정부·국제기구 데이터 통합 후
            paired t-test p=0.0086으로 정확도 향상 입증 (n=15, mean composite 72.0/100).
          </p>
          <p>
            <strong>데이터 거버넌스</strong> — PIPA + 전자금융거래법 준수. 챌린지 운영기관 가이드라인에
            따라 비식별화 + workspace 격리 + 프로젝트 종료 시 환원/폐기. ISMS-P 2027 Q2 / ISO 27001
            2027 Q3 인증 로드맵.
          </p>
        </div>
      </section>

      {/* 차별점 */}
      <section className="bg-slate-900 text-slate-100 rounded-xl p-5">
        <h2 className="text-base font-semibold mb-3">왜 Mr.AI인가</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-amber-400 font-bold mb-1">운영 중인 SaaS</div>
            <p className="text-slate-300 text-xs leading-relaxed">
              법인 + 사업자등록 + 통신판매업신고 + 운영 도메인 모두 완료. 다른 응모팀 대부분은 구상안
              단계.
            </p>
          </div>
          <div>
            <div className="text-amber-400 font-bold mb-1">검증된 정확도 인프라</div>
            <p className="text-slate-300 text-xs leading-relaxed">
              validation_dataset_v0 자동 스코어링 + Phase E·F benchmark trajectory 공개. paired
              t-test 통계 유의 결과 보유.
            </p>
          </div>
          <div>
            <div className="text-amber-400 font-bold mb-1">5개국어 + 영상 즉시</div>
            <p className="text-slate-300 text-xs leading-relaxed">
              K-name localization · Smartstore/Shopee/Tmall 시장별 톤 · Kling v1.6 Pro 영상까지 한자리.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="text-center text-sm text-slate-600 py-4">
        문의: <a href="mailto:contact@markettwin.ai" className="text-slate-900 underline font-medium">contact@markettwin.ai</a>
      </section>
    </div>
  );
}

function ArchLayer({
  num,
  title,
  icon: Icon,
  items,
}: {
  num: string;
  title: string;
  icon: typeof Layers;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
          {num}
        </span>
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </div>
      <ul className="text-xs text-slate-700 space-y-0.5 pl-8">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-1">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
