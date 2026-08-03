// Integrate differentiation + beta + growth into one document, with architecture diagrams.
import { readFileSync, writeFileSync } from "node:fs";

const P = "proposals/";
const diff = readFileSync(P + "Market-Twin-Differentiation-Evidence.html", "utf8");
const beta = readFileSync(P + "Market-Twin-BetaTest-Report.html", "utf8");
const growth = readFileSync(P + "Market-Twin-Growth-Projection.html", "utf8");

const bodyOf = (s) => s.match(/<body>([\s\S]*)<\/body>/)[1];
let diffBody = bodyOf(diff), betaBody = bodyOf(beta), growthBody = bodyOf(growth);

// relabel each sub-doc cover eyebrow -> PART divider
diffBody = diffBody.replace(/<div class="eyebrow">[^<]*<\/div>/, '<div class="eyebrow">PART II</div>');
betaBody = betaBody.replace(/<div class="eyebrow">[^<]*<\/div>/, '<div class="eyebrow">PART III</div>');
growthBody = growthBody.replace(/<div class="eyebrow">[^<]*<\/div>/, '<div class="eyebrow">PART IV</div>');

// update the two 심사대응 mapping tables to reflect the INTEGRATED structure (PART I 아키텍처 · III 베타 · IV 성장성)
const MAP = [
  ["<th>본 자료의 대응</th>", "<th>본 통합자료의 대응</th>"],
  ["<th>대응 근거</th>", "<th>대응 근거 (통합본)</th>"],
  ["<td>3장 경쟁 비교 매트릭스</td>", "<td>PART II·3장 경쟁 비교 매트릭스</td>"],
  ["<td>4장 5대 차별축(근거 동반)</td>", "<td>PART I 아키텍처 · PART II·4장 차별축</td>"],
  ["<td>3·4장 + 8장 근거 목록</td>", "<td>PART II 3·4장 + 8장 근거목록</td>"],
  ["<td>6장 검증 방법론 · 7장 성장성</td>", "<td>PART I 아키텍처 · PART II·6장 · PART IV 성장성</td>"],
  ["<td>3·7장</td>", "<td>PART III 베타 · PART IV 성장성</td>"],
  ["<td>3·4장</td>", "<td>PART II 3·4장 · PART III 베타</td>"],
  ["<td>3장 매트릭스 + 4장 5대 차별축</td>", "<td>PART II·3장 매트릭스 · PART I 아키텍처</td>"],
  ["<td>각 축의 「객관적 근거」 박스 + 8장 목록</td>", "<td>각 축의 「객관적 근거」 박스 · PART II·8장 목록</td>"],
  ["<td>4장 + 7장 백테스트 원자료</td>", "<td>PART II·4장·백테스트 · PART III 베타</td>"],
  ["<td>6장 방법론(7개 장치)</td>", "<td>PART I 아키텍처 · PART II·6장 방법론</td>"],
  ["<td>7장 기술→성장 인과</td>", "<td>PART IV 사업 성장성 (매출·구독자 예측)</td>"],
  ["<td>3·4장 (A·D군 구조적 약점 대비)</td>", "<td>PART II 3·4장 · PART III 베타</td>"],
];
for (const [a, b] of MAP) diffBody = diffBody.split(a).join(b); // split/join = replace-all (handles 4·5장 x2 below)
diffBody = diffBody.split("<td>4·5장</td>").join("<td>PART I 아키텍처 · PART II 4·5장</td>");

// CSS addendum (union of extra classes used by beta/growth + figures)
const ADDENDUM = `
  .r{text-align:right;}
  figure{margin:10px 0;} figure img{width:100%;border:1px solid var(--line);border-radius:8px;display:block;} figcaption{font-size:10.5px;color:var(--muted);margin-top:5px;text-align:center;}
  .figgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;} .figgrid figure{margin:2px 0;} .figgrid img{width:100%;border:1px solid var(--line);border-radius:6px;} .figgrid figcaption{font-size:10px;}
  .diff{background:#f6fef9;border:1px solid #bbf7d0;border-left:4px solid var(--ok);border-radius:0 9px 9px 0;padding:10px 13px;margin:9px 0;} .diff .lab{font-size:10.5px;font-weight:800;color:#15803d;letter-spacing:.04em;text-transform:uppercase;} .diff p{font-size:11.5px;color:#14532d;margin:3px 0;}
  .badge{display:inline-block;font-size:11px;font-weight:800;padding:3px 12px;border-radius:999px;} .b-mod{background:#dbeafe;color:#1d4ed8;} .b-weak{background:#fef3c7;color:#b45309;} .b-str{background:#dcfce7;color:#15803d;}
  .bar{height:14px;background:var(--blue);border-radius:3px;display:inline-block;vertical-align:middle;}
  h2 .en{font-size:13px;color:var(--muted);font-weight:700;}
`;

const NEW_COVER = `
<section class="page cover">
  <div>
    <div class="eyebrow">심사 보완자료 · 종합 기술·사업 입증자료 (통합본)</div>
    <h1>Market Twin<br>종합 입증자료</h1>
    <p class="tag">기술 아키텍처 · 경쟁 차별성 · 베타테스트 실증 · 사업 성장성을 <b style="color:#fff">하나로 통합</b>한 심사 보완 종합자료입니다.</p>
    <div class="statrow">
      <div><div class="n">74% / 68%</div><div class="l">백테스트 top-3 / top-2 (N=19)</div></div>
      <div><div class="n">24개국</div><div class="l">공식데이터 grounding</div></div>
      <div><div class="n">3개 실브랜드</div><div class="l">베타테스트 실증</div></div>
      <div><div class="n">29억</div><div class="l">2029 매출 예측</div></div>
    </div>
  </div>
  <div class="metabox">
    <p><b>주식회사 미스터에이아이 (Mr.AI Inc.)</b> · 대표이사 이현우</p>
    <p>제품: markettwin.ai · 문의: chris@markettwin.ai · 2026</p>
  </div>
  <div class="pnum" style="color:#93c5fd;">00</div>
</section>

<section class="page">
  <div class="sec-no">Contents</div>
  <h1 style="margin-bottom:6px;">목차</h1>
  <p class="lead" style="margin-bottom:16px;">본 통합본은 심사 지적사항(기술 차별성·객관성·성장성)에 대응하는 4개 파트로 구성됩니다.</p>
  <table>
    <tr><th style="width:18%">파트</th><th>내용</th><th style="width:22%">대응 심사항목</th></tr>
    <tr><td><b>PART I</b></td><td>제품 &amp; 기술 아키텍처 (9개 엔진 연결도·핵심 모듈)</td><td>기술성·객관성</td></tr>
    <tr><td><b>PART II</b></td><td>기술 차별성 &amp; 경쟁우위 (경쟁 비교·구조적 한계·백테스트·혁신성)</td><td>차별성·혁신성·비교자료</td></tr>
    <tr><td><b>PART III</b></td><td>베타테스트 실증 (르무통·FRONT2LINE·Juicy Brix)</td><td>경쟁성·차별성 실증</td></tr>
    <tr><td><b>PART IV</b></td><td>사업 성장성 (매출·구독자 3개년 예측)</td><td>사업 성장성</td></tr>
  </table>
  <div class="callout"><p><b>구성 원리.</b> 아키텍처(실체) → 차별성(왜 우월한가) → 베타(실증) → 성장성(그래서 성장한다)의 <b>인과 흐름</b>으로 배열해, 심사위원이 기술의 객관성부터 사업 성장성까지 하나의 논리로 확인할 수 있습니다.</p></div>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>

<section class="page cover">
  <div>
    <div class="eyebrow">PART I</div>
    <h1>제품 &amp; 기술 아키텍처</h1>
    <p class="tag">9개 엔진이 함수 단위로 연결된 Market Twin 시뮬레이션 파이프라인 — 기술적 실체이자 차별성(grounding·앙상블·검증)의 근거.</p>
  </div>
  <div class="metabox"><p><b>주식회사 미스터에이아이</b> · markettwin.ai</p></div>
  <div class="pnum" style="color:#93c5fd;">00</div>
</section>

<section class="page">
  <div class="sec-no">Part I · 시스템 아키텍처</div>
  <h2>전체 엔진 연결도</h2>
  <p class="lead">Market Twin은 사용자 입력을 <b>9개 엔진</b>이 함수 단위로 처리하는 파이프라인입니다. 각 엔진은 앞서 제시할 기술 차별성(grounding·다중 LLM 앙상블·백테스트)의 <b>구현 실체</b>입니다.</p>
  <figure><img src="../docs/architecture/00-master.png"><figcaption>Market Twin 엔진 전체 연결도 — 9개 엔진 · 함수 단위 데이터 흐름</figcaption></figure>
  <h3>엔진 → 차별성 매핑</h3>
  <ul>
    <li><b>② 앙상블 오케스트레이터 + ⑤ 다중 LLM:</b> 200 페르소나 × 다중 시뮬 × 복수 LLM 교차검증 → <b>단일 모델 편향 제거</b> (Part II 차별축 ②)</li>
    <li><b>③ 시장조사/데이터 인제스천 + ④ 레퍼런스 데이터:</b> 24개국 공식통계 grounding·환각 차단 → <b>근거 있는 결과</b> (차별축 ①)</li>
    <li><b>⑦ 검증/백테스트 + ⑧ 품질 감사:</b> hindsight 채점·신뢰도 캘리브레이션 → <b>객관적 검증</b> (차별축 ③)</li>
    <li><b>⑥ 의사결정/가격 + ⑨ 리포트:</b> 시장·가격·리스크를 <b>즉시 실행 가능한 결정</b>으로 산출 (차별축 ⑤)</li>
  </ul>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>

<section class="page">
  <div class="sec-no">Part I · 핵심 모듈 ① 앙상블</div>
  <h2>② 앙상블 오케스트레이터</h2>
  <p class="lead">200 페르소나 × 다중 시뮬레이션 × 복수 LLM을 <b>교차 집계</b>해 신뢰도·합의까지 산출하는 핵심 엔진입니다.</p>
  <figure><img src="../docs/architecture/02-ensemble-orchestrator.png"><figcaption>② 앙상블 오케스트레이터 — 다중 시뮬·신뢰도·합의 집계 (orchestrator.ts)</figcaption></figure>
  <h3>차별점 연결</h3>
  <ul>
    <li><b>단일 모델 편향 제거:</b> N회 시뮬을 median으로 집계 → 특정 AI의 버릇을 상쇄 (Part II 차별축 ②).</li>
    <li><b>신뢰도 캘리브레이션:</b> 제공자 간 합의·득표차로 STRONG/MODERATE/WEAK 산출 → 과신 방지.</li>
    <li><b>비용 서킷브레이커:</b> 티어별 예산 상한을 코드에 내장 → 건별 원가 통제(단위경제).</li>
  </ul>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>

<section class="page">
  <div class="sec-no">Part I · 핵심 모듈 ② Grounding</div>
  <h2>③ 시장조사 / 데이터 인제스천</h2>
  <p class="lead">24개국 <b>공식 통계를 시뮬레이션에 주입(grounding)</b>하고 환각을 차단하는, 경쟁 서비스와 가장 크게 갈리는 모듈입니다.</p>
  <figure><img src="../docs/architecture/03-market-research.png"><figcaption>③ 시장조사/데이터 인제스천 — Comtrade·World Bank·KOTRA·DART·관세청 등 24개국 grounding</figcaption></figure>
  <h3>차별점 연결</h3>
  <ul>
    <li><b>근거 있는 결과:</b> LLM 사전지식이 아니라 <b>실제 공개 통계</b>에 근거 → 제3자 검증 가능 (차별축 ①).</li>
    <li><b>환각 차단:</b> 그라운딩 블록으로 근거 없는 답변을 억제.</li>
    <li><b>아시아 특화:</b> DART·식약처·KOTRA 등 한국·아시아 공식 소스 심층 결합.</li>
  </ul>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>

<section class="page">
  <div class="sec-no">Part I · 핵심 모듈 ③ 다중 LLM</div>
  <h2>⑤ LLM 멀티프로바이더</h2>
  <p class="lead">복수 AI 제공자를 <b>교차검증·폴백</b>하는 구조로, 단일 벤더·단일 모델 종속을 제거합니다.</p>
  <figure><img src="../docs/architecture/05-llm-multiprovider.png"><figcaption>⑤ LLM 멀티프로바이더 — Anthropic·OpenAI·Gemini·DeepSeek 교차검증·폴백</figcaption></figure>
  <h3>차별점 연결</h3>
  <ul>
    <li><b>모델 편향 상쇄:</b> 여러 AI의 합의를 신뢰도에 반영 → 범용 LLM 단독 사용과 근본적 차이 (차별축 ②).</li>
    <li><b>가용성·안정성:</b> Provider Fallback으로 특정 API 장애에도 시뮬 지속.</li>
    <li><b>비용/품질 최적화:</b> 티어·단계별로 적합 모델 선택.</li>
  </ul>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>

<section class="page">
  <div class="sec-no">Part I · 핵심 모듈 ④ 검증</div>
  <h2>⑦ 검증 / 백테스트</h2>
  <p class="lead">정확도를 <b>과거 실제 사례로 재현·채점</b>하고 신뢰도를 캘리브레이션하는, 객관성의 핵심 모듈입니다.</p>
  <figure><img src="../docs/architecture/07-validation-backtest.png"><figcaption>⑦ 검증/백테스트 — score(result, truth)·top-3 적중·Spearman·신뢰도 캘리브레이션</figcaption></figure>
  <h3>차별점 연결</h3>
  <ul>
    <li><b>재현·반증 가능:</b> 방법·정답정의·채점기준 공개 → 제3자가 직접 재현 (차별축 ③).</li>
    <li><b>정직성:</b> 미스(오답)까지 공개하는 채점 파이프라인.</li>
    <li><b>캘리브레이션 환류:</b> 백테스트 결과로 신뢰도 규칙을 보정.</li>
  </ul>
  <div class="callout"><p><b>기술성·객관성의 실체.</b> 앞의 4개 모듈은 개념이 아니라 <b>실제 코드로 동작하는 함수</b>입니다(오픈베타 라이브). 심사의 "기술성 판단이 어렵다"는 지적에 대해, 아키텍처는 기술이 <b>구체적으로 어떻게 구현·검증되는지</b>를 시각적으로 입증합니다.</p></div>
  <div class="brandfoot">Market Twin · Mr.AI Inc.</div><div class="pnum">00</div>
</section>
`;

// assemble new body: new cover/toc/arch + diff(full) + beta(full) + growth(full)
const newBody = NEW_COVER + "\n" + diffBody + "\n" + betaBody + "\n" + growthBody;

// take diff file as base, inject CSS addendum, swap body
let out = diff.replace("</style>", ADDENDUM + "</style>");
out = out.replace(/<body>[\s\S]*<\/body>/, "<body>\n" + newBody + "\n</body>");
out = out.replace(/<title>[^<]*<\/title>/, "<title>Market Twin — 종합 입증자료 (통합본)</title>");

// renumber all pnums sequentially
let i = 0;
out = out.replace(/(<div class="pnum"[^>]*>)\d+(<\/div>)/g, (_, a, b) => { i++; return a + String(i).padStart(2, "0") + b; });

writeFileSync(P + "Market-Twin-Integrated-Dossier.html", out);
console.log("wrote Market-Twin-Integrated-Dossier.html | total pages(pnum):", i);
