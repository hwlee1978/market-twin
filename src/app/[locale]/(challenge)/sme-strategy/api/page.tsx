import { BookOpen, Terminal, Lock, Repeat } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * API 문서 — 심사위원이 자체 테스트 데이터로 endpoint 호출해 정확도·
 * 재현성·콘텐츠 품질을 직접 측정 가능.
 */
export default function ApiDocsPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded mb-2">
          심사위원용 API
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-slate-700" />
          API 문서
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          심사기관이 자체 테스트셋으로 endpoint 직접 호출해 정확도·재현성·콘텐츠 품질 평가 가능.
          모든 endpoint는 JSON in/out + 비용·시간 metadata 포함.
        </p>
      </header>

      {/* Auth */}
      <Section icon={Lock} title="인증">
        <p>
          모든 endpoint는 Supabase Auth 세션 cookie 인증. 심사 평가 시 별도 sandbox 워크스페이스 계정 발급
          예정 (contact@markettwin.ai). 자동 평가 시나리오는 service-role 키로 직접 DB 접근 가능 (별도
          요청).
        </p>
      </Section>

      {/* Task 1 */}
      <Endpoint
        method="POST"
        path="/api/challenge/recommend"
        title="Task 1 · 적합 판로 추천"
        desc="기업·제품 정보 → 판판대로 + 수출바우처 중 Top-K 매칭"
        request={`{
  "company": {
    "name": "(주)예시기업",
    "industry": "신발 제조",
    "region": "서울",
    "revenue_band": "10-50억",
    "employee_band": "5-20명"
  },
  "products": [
    {
      "name": "메리노 울 스니커즈",
      "category": "신발",
      "description": "통근용 울 어퍼 + 러버 컵솔"
    }
  ],
  "intent": "both",
  "goal": "동남아 신규 진출",
  "top_k": 5,
  "dataset_split": "test",  // "train" | "test" | "holdout" | "prod"
  "use_cache": true          // 동일 input_hash 캐시 활용
}`}
        response={`{
  "recommendations": [
    {
      "program_id": "uuid",
      "program_table": "ch_pp_programs",
      "program_name": "...",
      "type": "domestic",
      "similarity_score": 0.8234,
      "llm_rank": 1,
      "llm_score": 87,
      "reason": "한국어 매칭 이유",
      "warnings": ["선택 사항"]
    }
  ],
  "input_hash": "sha256:...",        // 재현성 키
  "stage1_candidates": 30,
  "generation_ms": 18420,
  "cost_usd": 0.0234,
  "cached": false
}`}
        notes={[
          { icon: Repeat, text: "동일 input → 동일 input_hash → temperature=0로 결과 보장" },
          { icon: Lock, text: "사업자등록번호 SHA-256 해시 비식별화 (원본 DB 미적재)" },
        ]}
      />

      {/* Task 2 - content */}
      <Endpoint
        method="POST"
        path="/api/challenge/content"
        title="Task 2 ①② · 시장분석 리포트 + 다국어 상품 기술서"
        desc="제품 정보 → 리포트 + 5개국어 spec 병렬 생성"
        request={`{
  "company": { "name": "...", "industry": "..." },
  "product": {
    "name": "메리노 울 스니커즈",
    "category": "신발",
    "description": "..."
  },
  "goal": "동남아 진출",
  "recommendations": [],   // Task 1 결과 또는 빈 배열
  "target_markets": ["TW", "JP"],
  "generate": { "report": true, "spec": true }
}`}
        response={`{
  "report": {
    "executive_summary": "...",
    "matched_programs": [],
    "market_signals": [...],
    "recommended_actions": [...],
    "risks": [...],
    "generation_ms": 28340,
    "cost_usd": 0.0421
  },
  "spec": {
    "by_locale": {
      "ko": { "headline": "...", "tagline": "...", "body": "...", "bullets": [...], "cta": "..." },
      "en": { ... },
      "ja": { ... },
      "zh-tw": { ... },
      "zh-cn": { ... }
    },
    "generation_ms": 38420,
    "cost_usd": 0.0612
  }
}`}
      />

      {/* Task 2 - video */}
      <Endpoint
        method="POST"
        path="/api/challenge/video"
        title="Task 2 ③ · 홍보영상 (Kling v1.6 Pro)"
        desc="제품 이미지 → 5-10초 MP4 (Supabase Storage 영구 보존)"
        request={`{
  "image_url": "https://...",
  "motion_prompt": "Subtle camera push-in",  // 선택
  "duration": 5,                              // 5 | 10
  "aspect_ratio": "16:9"                      // "16:9" | "9:16" | "1:1"
}`}
        response={`{
  "video_url": "https://...supabase.co/.../mp4",
  "duration_sec": 5,
  "generation_ms": 87340,
  "cost_usd": 0.5
}`}
      />

      {/* Reproducibility check */}
      <Section icon={Repeat} title="재현성 검증 (평가 시나리오)">
        <p>심사기관이 동일 입력으로 2회 호출 후 결과 비교:</p>
        <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded-lg overflow-x-auto mt-2">
{`# 1st call
curl -X POST https://mrai.markettwin.ai/api/challenge/recommend \\
  -H "Content-Type: application/json" \\
  -H "Cookie: $SESSION" \\
  -d @input.json
# → input_hash = abc123...

# 2nd call (동일 input)
curl -X POST .../api/challenge/recommend ... -d @input.json
# → input_hash = abc123... (동일)
# → use_cache=true 시 1st call 결과 그대로 반환 (재현성 보장)
# → use_cache=false 시 새 LLM 호출 → temperature=0이라 동일 출력`}
        </pre>
      </Section>

      {/* Evaluation harness */}
      <Section icon={Terminal} title="평가 harness (선택)">
        <p>
          심사기관이 자체 테스트셋으로 정확도 측정 시 <code>dataset_split: &quot;test&quot;</code> 표시 →
          ch_recommendations 테이블에 분리 저장. 결과 export:
        </p>
        <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded-lg overflow-x-auto mt-2">
{`SELECT input_hash, recommendations, model_version, generated_at
FROM ch_recommendations
WHERE dataset_split = 'test'
ORDER BY generated_at DESC;`}
        </pre>
        <p className="mt-2 text-xs">
          심사기관 ground-truth와 비교해 Hit@K / MRR / NDCG 측정 가능.
        </p>
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-600" />
        {title}
      </h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Endpoint({
  method,
  path,
  title,
  desc,
  request,
  response,
  notes,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  desc: string;
  request: string;
  response: string;
  notes?: Array<{ icon: typeof Lock; text: string }>;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${method === "POST" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
            {method}
          </span>
          <code className="text-sm font-mono text-slate-900">{path}</code>
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Request</div>
          <pre className="bg-slate-900 text-slate-100 text-[11px] p-3 rounded overflow-x-auto leading-relaxed">{request}</pre>
        </div>
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Response (200)</div>
          <pre className="bg-slate-900 text-slate-100 text-[11px] p-3 rounded overflow-x-auto leading-relaxed">{response}</pre>
        </div>
      </div>
      {notes && notes.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 space-y-1.5">
          {notes.map((n, i) => (
            <div key={i} className="text-xs text-slate-700 flex items-start gap-2">
              <n.icon className="shrink-0 w-3.5 h-3.5 text-slate-500 mt-0.5" />
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
