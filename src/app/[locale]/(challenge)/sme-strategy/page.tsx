import { Link } from "@/i18n/navigation";
import {
  Building2,
  FileText,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Globe2,
  Video,
  ShoppingBag,
  Hash,
  Repeat,
  Database,
  Target,
} from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * 챌린지 랜딩 페이지 — 시스템 개요 + Task 1·2 진입 카드.
 * 응모서 첨부 URL의 첫 화면. 심사위원 즉시 이해 가능한 구조.
 */
export default function ChallengeLandingPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full mb-4">
          <Sparkles className="w-3 h-3" />
          2026 AI+ OpenData 챌린지 · 과제번호 20457281
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-3">
          중소·소상공인을 위한
          <br />
          <span className="text-slate-700">AI 시장진출 전략 추천 시스템</span>
        </h1>
        <p className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          정부 OpenData (판판대로 + 수출바우처) 위에 멀티 LLM 매칭 엔진과 5개국어 마케팅 콘텐츠
          생성기를 결합. <strong className="text-slate-900">90초 안에</strong> 적합 지원사업 추천과
          상세페이지·홍보영상까지 한자리에서 산출.
        </p>
      </section>

      {/* 2 Task Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
        <TaskCard
          tag="Task 1"
          tone="amber"
          title="적합 판로 추천"
          summary="기업·제품 정보 → 판판대로 90개 지원사업 + 수출바우처 5.8만 프로그램 중 Top-K 자동 매칭"
          deliverables={[
            "내수 지원사업 추천 (판판대로)",
            "수출 바우처 프로그램 추천",
            "매칭 이유 + 적합도 점수",
          ]}
          ctaHref="/sme-strategy/recommend"
          ctaLabel="추천 실행"
          icon={Building2}
        />
        <TaskCard
          tag="Task 2"
          tone="sky"
          title="마케팅 콘텐츠 제작"
          summary="추천 결과 기반 + 자체 제품 정보 → 4종 산출물 자동 생성"
          deliverables={[
            "시장분석 리포트 (경영진 brief)",
            "다국어 상품 기술서 (5개국어)",
            "홍보영상 5초 (Kling v1.6 Pro)",
            "상세페이지 (Smartstore · Shopee · Tmall)",
          ]}
          ctaHref="/sme-strategy/content"
          ctaLabel="콘텐츠 생성"
          icon={FileText}
        />
      </section>

      {/* 판정기준 충족 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">판정기준 충족 인프라</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Criterion
            num="01"
            label="모델 예측 정확도 · 재현성"
            items={[
              { icon: Hash, text: "input SHA-256 해시로 재현성 키" },
              { icon: Repeat, text: "동일 입력 → 동일 출력 보장 (temperature 0)" },
              { icon: CheckCircle2, text: "dataset_split (train/test/holdout/prod) 컬럼 분리" },
            ]}
          />
          <Criterion
            num="02"
            label="CSV Batch 평가 지원"
            items={[
              { icon: Database, text: "심사기관 테스트셋 (CSV) 일괄 처리" },
              { icon: Target, text: "각 기업별 적합 사업/바우처 정확한 답 + 이유" },
              { icon: Repeat, text: "결과 CSV + input_hash 비교로 재현성 자동 검증" },
            ]}
          />
        </div>
      </section>

      {/* 제공 데이터 활용 */}
      <section className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-2">활용 데이터 (최근 3개년)</h2>
        <p className="text-xs text-slate-500 mb-4">
          챌린지 운영기관 제공 데이터는 비식별화 후 PIPA·전자금융거래법 거버넌스 하에 적재.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
              내수 (판판대로)
            </div>
            <ul className="space-y-1 text-slate-700">
              <li>· 지원사업 정보 (~90개) — CSV</li>
              <li>· 선정기업 정보 (~7만社) — CSV</li>
              <li>· 선정기업 제품 (~7만) — CSV</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-2">
              수출 (수출바우처)
            </div>
            <ul className="space-y-1 text-slate-700">
              <li>· 프로그램 정보 (~5.8만) — Excel</li>
              <li>· 수출성과 정보 (~1.1만) — Excel</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4 deliverables 미리보기 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Task 2 산출물 4종</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniCard icon={FileText} label="시장분석 리포트" desc="경영진 brief" />
          <MiniCard icon={Globe2} label="다국어 기술서" desc="KR·EN·JP·TW·CN" />
          <MiniCard icon={Video} label="홍보영상 5초" desc="Kling v1.6 Pro" />
          <MiniCard icon={ShoppingBag} label="상세페이지" desc="시장별 mockup" />
        </div>
      </section>

      {/* Footer link */}
      <section className="text-center">
        <div className="inline-flex items-center gap-3 text-xs text-slate-500">
          <Link href="/sme-strategy/api" className="hover:text-slate-900 underline">
            API 문서 →
          </Link>
          <span>·</span>
          <Link href="/sme-strategy/about" className="hover:text-slate-900 underline">
            팀·아키텍처·검증 거버넌스 →
          </Link>
        </div>
      </section>
    </div>
  );
}

function TaskCard({
  tag,
  tone,
  title,
  summary,
  deliverables,
  ctaHref,
  ctaLabel,
  icon: Icon,
}: {
  tag: string;
  tone: "amber" | "sky";
  title: string;
  summary: string;
  deliverables: string[];
  ctaHref: string;
  ctaLabel: string;
  icon: typeof Building2;
}) {
  const toneClass = {
    amber: {
      tagBg: "bg-amber-100 text-amber-800",
      iconBg: "bg-amber-50 text-amber-600",
      cta: "bg-amber-600 hover:bg-amber-700",
    },
    sky: {
      tagBg: "bg-sky-100 text-sky-800",
      iconBg: "bg-sky-50 text-sky-600",
      cta: "bg-sky-600 hover:bg-sky-700",
    },
  }[tone];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded ${toneClass.tagBg}`}>
          {tag}
        </span>
        <div className={`w-10 h-10 rounded-xl ${toneClass.iconBg} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-4">{summary}</p>
      <ul className="space-y-1.5 mb-5 text-sm text-slate-700 flex-1">
        {deliverables.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <CheckCircle2 className="shrink-0 w-4 h-4 text-emerald-600 mt-0.5" />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md text-white text-sm font-medium ${toneClass.cta} transition-colors`}
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function Criterion({
  num,
  label,
  items,
}: {
  num: string;
  label: string;
  items: Array<{ icon: typeof Hash; text: string }>;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-bold text-slate-400">{num}</span>
        <span className="text-sm font-semibold text-slate-900">{label}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <it.icon className="shrink-0 w-3.5 h-3.5 text-slate-400 mt-1" />
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniCard({
  icon: Icon,
  label,
  desc,
}: {
  icon: typeof FileText;
  label: string;
  desc: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-2">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{desc}</div>
    </div>
  );
}
