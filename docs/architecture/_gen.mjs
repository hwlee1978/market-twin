// Market Twin 엔진 함수단위 아키텍처 다이어그램 생성기.
// SVG 직접 작성 → sharp로 PNG 변환. 한글은 Malgun Gothic.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = dirname(fileURLToPath(import.meta.url));
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const MONO = "'Cascadia Code','Consolas','D2Coding',monospace";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── primitives ────────────────────────────────────────────────────────────
function node(n) {
  const { x, y, w, h, color = "#2563eb", title, lines = [], soft = false } = n;
  const fill = soft ? "#ffffff" : "#ffffff";
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${color}" stroke-width="${soft ? 1.3 : 2}" ${soft ? 'stroke-dasharray="5 4"' : ""}/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="22" rx="9" fill="${color}"/>`;
  s += `<rect x="${x}" y="${y + 11}" width="${w}" height="11" fill="${color}"/>`;
  s += `<text x="${x + 10}" y="${y + 15.5}" font-family="${FONT}" font-size="11.5" font-weight="700" fill="#ffffff">${esc(title)}</text>`;
  lines.forEach((ln, i) => {
    const mono = ln.startsWith("ƒ") || /[(){}]/.test(ln) || ln.startsWith("•f");
    const txt = ln.replace(/^•f/, "");
    s += `<text x="${x + 10}" y="${y + 38 + i * 14.5}" font-family="${mono ? MONO : FONT}" font-size="${mono ? 10 : 10.5}" fill="${mono ? "#1e293b" : "#475569"}">${esc(txt)}</text>`;
  });
  return s;
}
function port(n, side) {
  const { x, y, w, h } = n;
  if (side === "b") return [x + w / 2, y + h];
  if (side === "t") return [x + w / 2, y];
  if (side === "l") return [x, y + h / 2];
  if (side === "r") return [x + w, y + h / 2];
  return [x + w / 2, y + h / 2];
}
function edge(a, sa, b, sb, opts = {}) {
  const [x1, y1] = port(a, sa);
  const [x2, y2] = port(b, sb);
  const { label, dashed, color = "#94a3b8", elbow } = opts;
  let d;
  if (elbow === "v") {
    const my = (y1 + y2) / 2;
    d = `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
  } else if (elbow === "h") {
    const mx = (x1 + x2) / 2;
    d = `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
  } else {
    d = `M${x1},${y1} L${x2},${y2}`;
  }
  let s = `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" ${dashed ? 'stroke-dasharray="5 4"' : ""} marker-end="url(#arrow)"/>`;
  if (label) {
    const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
    s += `<rect x="${lx - label.length * 3.0 - 4}" y="${ly - 8}" width="${label.length * 6.0 + 8}" height="15" rx="3" fill="#ffffff" opacity="0.92"/>`;
    s += `<text x="${lx}" y="${ly + 3}" font-family="${FONT}" font-size="9.5" fill="#64748b" text-anchor="middle">${esc(label)}</text>`;
  }
  return s;
}
function note(x, y, w, text, color = "#f59e0b") {
  const lines = text.split("\n");
  const h = 8 + lines.length * 13;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${color}11" stroke="${color}" stroke-width="1" stroke-dasharray="3 3"/>`;
  lines.forEach((ln, i) => {
    s += `<text x="${x + 9}" y="${y + 17 + i * 13}" font-family="${FONT}" font-size="9.8" fill="#7c5b09">${esc(ln)}</text>`;
  });
  return s;
}
function doc(w, h, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker></defs>
<rect width="${w}" height="${h}" fill="#f8fafc"/>
<rect x="0" y="0" width="${w}" height="52" fill="#0a1f4d"/>
<text x="26" y="26" font-family="${FONT}" font-size="18" font-weight="800" fill="#ffffff">${esc(title)}</text>
<text x="26" y="43" font-family="${FONT}" font-size="11" fill="#93c5fd">${esc(subtitle)}</text>
<text x="${w - 20}" y="${h - 12}" font-family="${MONO}" font-size="9" fill="#cbd5e1" text-anchor="end">Market Twin · function-level architecture</text>
${body}
</svg>`;
}

// 색상
const C = { sim: "#2563eb", data: "#0891b2", ref: "#0d9488", llm: "#7c3aed", dec: "#ea580c", val: "#16a34a", qa: "#dc2626", rep: "#475569", orch: "#1d4ed8", db: "#9333ea" };

const diagrams = {};

// ── 00 MASTER ───────────────────────────────────────────────────────────────
diagrams["00-master"] = () => {
  const W = 1100, H = 720;
  const n = {};
  n.input = { x: 460, y: 70, w: 180, h: 40, color: "#0a1f4d", title: "사용자 입력", lines: ["projectInput (제품·가격·시장)"] };
  n.orch = { x: 120, y: 150, w: 860, h: 120, color: C.orch, title: "② 앙상블 오케스트레이터  (orchestrator.ts)", lines: [
    "ƒ runEnsemble(context) — 티어 선택(3~50 sim) · 비용 서킷브레이커",
    "ƒ prefetchSimulationContext() — 외부데이터 1회 프리페치(전 sim 공유)",
    "ƒ aggregateEnsemble(snapshots) — N개 결과 집계·신뢰도·합의" ] };
  n.mr = { x: 120, y: 320, w: 250, h: 96, color: C.data, title: "③ 시장조사/데이터 인제스천", lines: ["tavily · comtrade · world-bank", "kotra · dart · 관세청 · mfds", "→ 그라운딩 블록(환각 차단)"] };
  n.ref = { x: 120, y: 440, w: 250, h: 80, color: C.ref, title: "④ 레퍼런스 데이터", lines: ["country_stats / profession_income", "consumer_norms / competitors"] };
  n.sim = { x: 425, y: 320, w: 250, h: 200, color: C.sim, title: "① 시뮬레이션 엔진 ×N (runner.ts)", lines: [
    "ƒ runSimulation(opts)", "S0 evaluateRegulatory()", "S1 personas (풀+생성+반응)", "S2 aggregateCountryScores() ×5", "S3 computePricingRange()+가격 ×5", "S4 synthesis + critique" ] };
  n.llm = { x: 730, y: 320, w: 250, h: 96, color: C.llm, title: "⑤ LLM 멀티프로바이더", lines: ["ƒ getLLMProvider(stage,category)", "withProviderFallback / Usage", "anthropic·openai·gemini·deepseek·xai"] };
  n.qa = { x: 730, y: 440, w: 250, h: 80, color: C.qa, title: "⑧ 품질 감사", lines: ["ƒ auditQuality(result)", "confidenceScore · quarantined"] };
  n.dec = { x: 425, y: 560, w: 250, h: 76, color: C.dec, title: "⑥ 의사결정/CAC·가격", lines: ["ƒ cacFromPersonas() · 채널비용", "computePricingRange / 스트레스"] };
  n.rep = { x: 730, y: 560, w: 250, h: 76, color: C.rep, title: "⑨ 리포트 / PDF", lines: ["ensemble-pdf / validation-pdf", "Executive · Detailed · Hypothesis"] };
  n.val = { x: 120, y: 560, w: 250, h: 76, color: C.val, title: "⑦ 검증 / 백테스트 (오프라인)", lines: ["ƒ score(result, truth)", "top3Hit · Spearman ρ · 캘리브레이션"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.input, "b", n.orch, "t");
  b += edge(n.orch, "b", n.mr, "t", { elbow: "v", label: "프리페치" });
  b += edge(n.orch, "b", n.sim, "t", { elbow: "v", label: "N개 팬아웃" });
  b += edge(n.orch, "b", n.llm, "t", { elbow: "v" });
  b += edge(n.mr, "b", n.ref, "t", { dashed: true });
  b += edge(n.ref, "r", n.sim, "l", { label: "그라운딩" });
  b += edge(n.llm, "b", n.sim, "r", { elbow: "h", dashed: true, label: "호출" });
  b += edge(n.sim, "b", n.dec, "t");
  b += edge(n.sim, "b", n.qa, "t", { elbow: "v", dashed: true });
  b += edge(n.dec, "r", n.rep, "l");
  b += edge(n.qa, "b", n.rep, "t", { elbow: "v", dashed: true });
  b += note(820, 62, 260, "ⓘ 핵심 패턴\n· 멀티샘플 median (국가·가격 5회)\n· 그라운딩 우선 (환각 차단)\n· 풀 재사용 + 멀티-LLM 폴백");
  return doc(W, H, "Market Twin — 엔진 전체 연결도 (Master)", "9개 엔진 · 함수 단위 데이터 흐름", b);
};

// ── 01 SIMULATION ENGINE ──────────────────────────────────────────────────
diagrams["01-simulation-engine"] = () => {
  const W = 1080, H = 980; const n = {};
  n.entry = { x: 420, y: 70, w: 240, h: 40, color: "#0a1f4d", title: "ƒ runSimulation(opts)", lines: ["runner.ts:487 — 엔트리"] };
  n.s0 = { x: 400, y: 150, w: 280, h: 56, color: C.sim, title: "Stage 0 · 규제 사전체크", lines: ["ƒ evaluateRegulatory(LLM, input, locale)", "→ allowedCountries[] / excluded[]"] };
  n.slots = { x: 60, y: 250, w: 250, h: 50, color: C.sim, title: "ƒ planSlots()", lines: ["→ PersonaSlot[] (국가×직업군×소득)"] };
  n.pool = { x: 60, y: 330, w: 250, h: 74, color: C.db, title: "1a · 풀 샘플링(재사용)", lines: ["fnv1a(projectId‖id) 결정적 정렬", "match (country, base_profession)", "→ hits / missSlots"] };
  n.fresh = { x: 350, y: 330, w: 250, h: 74, color: C.sim, title: "1b · 신규 생성 (LLM)", lines: ["PERSONA_SYSTEM + personaPrompt()", "batch 12 · 절단 재시도", "→ 풀에 저장(재사용)"] };
  n.react = { x: 640, y: 330, w: 250, h: 74, color: C.sim, title: "1c · 풀히트 반응 (LLM)", lines: ["PERSONA_REACTION_SYSTEM", "personaReactionPrompt()", "base + 반응 병합"] };
  n.san = { x: 350, y: 430, w: 250, h: 56, color: C.qa, title: "품질 게이트 (sanitizer)", lines: ["채널불일치 · voice-slip · 다양성"] };
  n.personas = { x: 380, y: 512, w: 290, h: 38, color: C.sim, title: "→ personas[] (~200)", lines: [] };
  n.refblk = { x: 720, y: 505, w: 300, h: 56, color: C.ref, title: "loadReferenceBundles()", lines: ["renderReferenceBlock() → 프롬프트 주입", "country_stats / income / norms / competitors"] };
  n.s2 = { x: 380, y: 590, w: 300, h: 70, color: C.sim, title: "Stage 2 · 국가 점수 (멀티샘플)", lines: ["countryPrompt() × 5 (병렬)", "ƒ aggregateCountryScores() — median", "FINAL_SCORE_WEIGHTS · 컴포넌트 재계산"] };
  n.s3 = { x: 380, y: 686, w: 300, h: 86, color: C.sim, title: "Stage 3 · 가격 (멀티샘플)", lines: ["ƒ extractCompetitorPrices() — 경쟁가 앵커", "ƒ computePricingRange() — min/max", "pricingPrompt() × 5 → median + 단조 클램프"] };
  n.s4 = { x: 380, y: 796, w: 300, h: 70, color: C.sim, title: "Stage 4 · 종합 + 비평", lines: ["SYNTHESIS_SYSTEM + synthesisPrompt()", "→ overview·creative·risks·추천", "비평/자동수정 (bestCountry·riskLevel 정합)"] };
  n.qa = { x: 720, y: 800, w: 300, h: 50, color: C.qa, title: "ƒ auditQuality()", lines: ["confidenceScore · warnings → simulation_quality"] };
  n.out = { x: 380, y: 895, w: 300, h: 40, color: "#0a1f4d", title: "→ SimulationResult", lines: ["simulation_results 저장 + notify"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.entry, "b", n.s0, "t");
  b += edge(n.s0, "b", n.slots, "t", { elbow: "v", label: "Stage 1 페르소나" });
  b += edge(n.slots, "b", n.pool, "t");
  b += edge(n.pool, "r", n.fresh, "l", { label: "miss" });
  b += edge(n.pool, "t", n.react, "t", { elbow: "h", dashed: true, label: "hit" });
  b += edge(n.fresh, "b", n.san, "t");
  b += edge(n.react, "b", n.san, "t", { elbow: "v" });
  b += edge(n.san, "b", n.personas, "t");
  b += edge(n.refblk, "l", n.s2, "r", { dashed: true, label: "그라운딩" });
  b += edge(n.personas, "b", n.s2, "t");
  b += edge(n.s2, "b", n.s3, "t");
  b += edge(n.s3, "b", n.s4, "t");
  b += edge(n.s4, "b", n.out, "t");
  b += edge(n.s4, "r", n.qa, "l", { dashed: true });
  b += note(60, 440, 250, "ⓘ 풀 = personas 테이블(글로벌)\n돌릴수록 hit↑ → 비용↓\n반응은 매 sim 재생성(제품별)");
  return doc(W, H, "① 시뮬레이션 엔진 (코어)", "runner.ts · 5-스테이지 함수 파이프라인", b);
};

// ── 02 ENSEMBLE ORCHESTRATOR ───────────────────────────────────────────────
diagrams["02-ensemble-orchestrator"] = () => {
  const W = 1040, H = 760; const n = {};
  n.entry = { x: 400, y: 70, w: 240, h: 40, color: "#0a1f4d", title: "ƒ runEnsemble(context)", lines: ["orchestrator.ts"] };
  n.tier = { x: 60, y: 150, w: 300, h: 110, color: C.orch, title: "TIER_PRESETS", lines: [
    "hypothesis 3 · decision 6", "decision_plus 15 · deep 25", "deep_pro 50  (각 200 페르소나)", "멀티 프로바이더 라운드로빈"] };
  n.budget = { x: 60, y: 290, w: 300, h: 60, color: C.qa, title: "비용 서킷브레이커", lines: ["TIER_BUDGET_CENTS (예산 3× 초과 → kill)"] };
  n.pre = { x: 420, y: 150, w: 320, h: 120, color: C.data, title: "ƒ prefetchSimulationContext()  (1회)", lines: [
    "tavily(트렌드·마진·KOL)", "comtrade(수출흐름) · world-bank(GDP)", "extractCompetitorPrices(URL→가격)", "→ 전 sim 공유 (25× 중복 차단)"] };
  n.pool = { x: 420, y: 320, w: 320, h: 92, color: C.orch, title: "워커 풀 (프로바이더별 동시성)", lines: [
    "anthropic·openai·deepseek·xai = 12", "gemini = 4 (버스트 약함)", "프로바이더별 큐 직렬 실행"] };
  n.sims = { x: 420, y: 440, w: 320, h: 50, color: C.sim, title: "ƒ runSimulation() × N", lines: ["→ ① 시뮬레이션 엔진 (각 결과 snapshot)"] };
  n.agg = { x: 360, y: 530, w: 440, h: 130, color: C.orch, title: "ƒ aggregateEnsemble(snapshots)", lines: [
    "· 국가 median + 신뢰도(across-sim std)", "· 컴포넌트 분해(시장·문화·채널·가격·경쟁·규제)", "· 프로바이더 합의(어느 LLM이 top-3 동의?)", "· 내러티브 머지(리스크 dedupe·추천 병합)", "· cacFromPersonas() · marketProfile"] };
  n.out = { x: 360, y: 690, w: 440, h: 40, color: "#0a1f4d", title: "→ EnsembleResult", lines: ["ensembles.aggregate_result 저장"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.entry, "b", n.tier, "t", { elbow: "v" });
  b += edge(n.entry, "b", n.pre, "t", { elbow: "v" });
  b += edge(n.tier, "b", n.budget, "t");
  b += edge(n.pre, "b", n.pool, "t");
  b += edge(n.budget, "r", n.pool, "l", { dashed: true, label: "감시" });
  b += edge(n.pool, "b", n.sims, "t");
  b += edge(n.sims, "b", n.agg, "t");
  b += edge(n.agg, "b", n.out, "t");
  return doc(W, H, "② 앙상블 오케스트레이터", "orchestrator.ts · 프리페치 → 팬아웃 → 집계", b);
};

// ── 03 MARKET RESEARCH ─────────────────────────────────────────────────────
diagrams["03-market-research"] = () => {
  const W = 1040, H = 640; const n = {};
  const srcs = [
    ["tavily.ts", "Tavily 검색", "트렌드·마진 벤치마크·KOL 생태계"],
    ["comtrade.ts", "UN Comtrade", "한국 수출 흐름(HSCode·국가별)"],
    ["world-bank.ts", "World Bank", "GDP-PPP·인구·소비"],
    ["kotra.ts", "KOTRA", "K-수출 시장 데이터"],
    ["dart.ts", "DART", "기업 공시·규제"],
    ["korea-customs.ts / unipass.ts", "관세청/UNIPASS", "수출입 통계"],
    ["mfds.ts", "MFDS", "식약 규제"],
    ["sonar.ts", "Perplexity Sonar", "웹 검색 그라운딩(폴백)"],
  ];
  let b = "";
  srcs.forEach((s, i) => {
    const x = 60 + (i % 2) * 360, y = 90 + Math.floor(i / 2) * 100;
    n["s" + i] = { x, y, w: 320, h: 76, color: C.data, title: s[1] + "  (" + s[0] + ")", lines: [s[2]] };
  });
  n.out = { x: 760, y: 230, w: 230, h: 200, color: C.sim, title: "그라운딩 블록", lines: [
    "tradeAnchorBlock", "worldBankBlock", "kolEcosystemByCountry", "competitorPriceBlock", "", "→ 프롬프트에 '사실' 주입", "→ 환각 차단(국가·가격)"] };
  b += Object.values(n).map(node).join("");
  for (let i = 0; i < srcs.length; i++) if (n["s" + i]) b += edge(n["s" + i], "r", n.out, "l", { color: "#cbd5e1" });
  b += note(60, 500, 670, "ⓘ orchestrator.prefetchSimulationContext()가 앙상블당 1회만 호출 → 전 sim 공유.  Market Twin은 정부·무역 공식 데이터를 그대로 사용(경북 AI무역센터와 동일 계열).");
  return doc(W, H, "③ 시장조사 / 데이터 인제스천 엔진", "market-research/ · 외부 소스 → 그라운딩 블록", b);
};

// ── 04 REFERENCE DATA ──────────────────────────────────────────────────────
diagrams["04-reference-data"] = () => {
  const W = 1000, H = 620; const n = {};
  n.load = { x: 360, y: 80, w: 300, h: 50, color: C.ref, title: "ƒ loadReferenceBundles(countries, category)", lines: ["4개 테이블 병렬 fetch"] };
  const tbls = [
    ["country_stats_latest", "GDP·인구·통화·중위소득", "→ 페르소나 소득 그라운딩"],
    ["country_profession_income", "직업×연령 소득 밴드", "→ 페르소나 제약 충족"],
    ["country_consumer_norms", "신뢰요인·반론·선호채널", "→ 문화 그라운딩"],
    ["category_competitors", "카테고리×국가 브랜드", "→ 경쟁 지형"],
  ];
  tbls.forEach((t, i) => { n["t" + i] = { x: 40 + (i % 2) * 250, y: 180 + Math.floor(i / 2) * 110, w: 230, h: 84, color: C.db, title: t[0], lines: [t[1], t[2]] }; });
  n.render = { x: 560, y: 200, w: 380, h: 60, color: C.ref, title: "ƒ renderReferenceBlock(bundles, locale)", lines: ["→ 텍스트 블록(페르소나/국가 프롬프트에 주입)"] };
  n.attr = { x: 560, y: 300, w: 380, h: 56, color: C.ref, title: "ƒ collectSourceAttributions()", lines: ["출처 URL 수집 → 결과 리포트 attribution"] };
  n.extra = { x: 560, y: 400, w: 380, h: 76, color: C.dec, title: "보조 레퍼런스 (CAC용)", lines: [
    "channel-costs.ts (채널 CVR·전환단가)", "cac-benchmarks.ts · hofstede-dimensions.ts"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.load, "b", n.t0, "t", { elbow: "v" });
  for (let i = 0; i < 4; i++) b += edge(n.load, "b", n["t" + i], "t", { elbow: "v", color: "#cbd5e1" });
  b += edge(n.t1, "r", n.render, "l", { color: "#cbd5e1" });
  b += edge(n.render, "b", n.attr, "t");
  return doc(W, H, "④ 레퍼런스 데이터 엔진", "reference/ + Supabase · 그라운딩 번들", b);
};

// ── 05 LLM MULTIPROVIDER ───────────────────────────────────────────────────
diagrams["05-llm-multiprovider"] = () => {
  const W = 1080, H = 700; const n = {};
  n.get = { x: 385, y: 80, w: 300, h: 56, color: C.llm, title: "ƒ getLLMProvider(stage, category)", lines: ["스테이지별 모델 라우팅 + 카테고리 다운그레이드"] };
  const provs = [
    ["anthropic.ts", "Sonnet 4.6"],
    ["openai.ts", "gpt-5.4-mini"],
    ["gemini.ts", "flash·pro"],
    ["deepseek.ts", "저가·다양성"],
    ["xai.ts", "grok-3-mini"],
  ];
  provs.forEach((p, i) => { n["p" + i] = { x: 40 + i * 137, y: 200, w: 125, h: 56, color: C.llm, title: p[0], lines: [p[1]] }; });
  n.wrap = { x: 250, y: 310, w: 560, h: 120, color: C.llm, title: "래퍼 체인", lines: [
    "ƒ withProviderFallback() — 5xx/429 → 타 프로바이더 (failover.ts)", "ƒ withUsageTracking() — 토큰·비용 누적 (프롬프트 캐시 read 0.1×)", "ƒ withCancelSignal() — AbortSignal 전파(사용자 취소)", "ƒ llmCallCostCents(provider, model, in, out, cacheW, cacheR)"] };
  n.route = { x: 735, y: 76, w: 310, h: 138, color: "#475569", title: "스테이지 기본 모델 (anthropic)", lines: [
    "personas = Sonnet 4.6", "countries = Haiku", "pricing  = Haiku", "synthesis = Sonnet 4.6", "env: LLM_*_PROVIDER / MODEL"] };
  n.out = { x: 385, y: 460, w: 300, h: 44, color: "#0a1f4d", title: "→ provider.generate(prompt)", lines: ["JSON 스키마 검증 결과 반환"] };
  let b = Object.values(n).map(node).join("");
  for (let i = 0; i < 5; i++) b += edge(n.get, "b", n["p" + i], "t", { elbow: "v", color: "#cbd5e1" });
  for (let i = 0; i < 5; i++) b += edge(n["p" + i], "b", n.wrap, "t", { color: "#cbd5e1" });
  b += edge(n.route, "l", n.get, "r", { dashed: true, label: "라우팅표" });
  b += edge(n.wrap, "b", n.out, "t");
  b += note(40, 560, 1000, "ⓘ 멀티-LLM = (1) 신뢰성(폴백)  (2) 교차검증 신호(프로바이더 합의 → 앙상블 confidence).  앙상블은 의도적으로 서로 다른 프로바이더에 sim을 배분.");
  return doc(W, H, "⑤ LLM 멀티프로바이더 엔진", "llm/ · 라우팅 · 폴백 · 사용량 추적", b);
};

// ── 06 DECISION-AID / CAC / PRICING ────────────────────────────────────────
diagrams["06-decision-cac-pricing"] = () => {
  const W = 1000, H = 660; const n = {};
  n.in = { x: 380, y: 80, w: 260, h: 44, color: "#0a1f4d", title: "personas[] + 국가 + 카테고리", lines: [] };
  n.extract = { x: 360, y: 160, w: 300, h: 56, color: C.dec, title: "1 · 채널 멘션 추출", lines: ["trustFactors/objections → IG·Shopee·Reddit…", "빈도 가중(share = count / total)"] };
  n.cost = { x: 360, y: 248, w: 300, h: 56, color: C.dec, title: "2 · 채널 단가 적용", lines: ["channel-costs.ts × COUNTRY_COST_INDEX", "CVR·전환단가(국가별)"] };
  n.brand = { x: 360, y: 336, w: 300, h: 50, color: C.dec, title: "3 · 신규브랜드 배수", lines: ["newBrandMultiplier (신규 진입 하한)"] };
  n.bench = { x: 360, y: 418, w: 300, h: 50, color: C.dec, title: "4 · 벤치마크 sanity", lines: ["cac-benchmarks.ts (카테고리×국가×단계)"] };
  n.cac = { x: 360, y: 500, w: 300, h: 44, color: "#0a1f4d", title: "→ CacRangeResult", lines: ["low / median / high (+ benchmarkFlag)"] };
  n.price = { x: 710, y: 248, w: 250, h: 80, color: C.dec, title: "ƒ computePricingRange()", lines: ["base가 + 페르소나 민감도", "+ 경쟁가 앵커 → min/max", "(Stage 3에서 사용)"] };
  n.stress = { x: 710, y: 360, w: 250, h: 64, color: C.dec, title: "stress-scenarios.ts", lines: ["가격·시장 민감도 시나리오", "(what-if)"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.in, "b", n.extract, "t");
  b += edge(n.extract, "b", n.cost, "t");
  b += edge(n.cost, "b", n.brand, "t");
  b += edge(n.brand, "b", n.bench, "t");
  b += edge(n.bench, "b", n.cac, "t");
  b += edge(n.in, "r", n.price, "t", { elbow: "h", dashed: true });
  return doc(W, H, "⑥ 의사결정 보조 / CAC·가격 엔진", "decision-aid/ · cac-from-personas.ts · pricing-range.ts", b);
};

// ── 07 VALIDATION / BACKTEST ───────────────────────────────────────────────
diagrams["07-validation-backtest"] = () => {
  const W = 980, H = 560; const n = {};
  n.fix = { x: 60, y: 110, w: 260, h: 70, color: C.val, title: "ƒ loadFixtures()  (loader.ts)", lines: ["Ground-truth 픽스처", "정답 랭킹 + 근거 지표"] };
  n.sim = { x: 60, y: 230, w: 260, h: 50, color: C.sim, title: "시뮬 결과 (앙상블)", lines: ["예측 랭킹·점수"] };
  n.score = { x: 400, y: 150, w: 320, h: 150, color: C.val, title: "ƒ score(result, truth)  (score.ts)", lines: [
    "top3Hit — 상위3 적중", "rankCorrelation — Spearman ρ (stats.ts)", "rejectRecall — 부적합국 탈락 재현율", "confidenceCalibration — 신뢰도 보정", "trendMatch — 트렌드 일치"] };
  n.cal = { x: 400, y: 340, w: 320, h: 56, color: C.val, title: "ƒ calibration-sync.ts", lines: ["픽스처 기반 가중치 자동 동기화 → 모델 튜닝"] };
  n.out = { x: 760, y: 195, w: 180, h: 60, color: "#0a1f4d", title: "→ 정확도 리포트", lines: ["validation-pdf", "교차검증 근거"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.fix, "r", n.score, "l", { label: "정답" });
  b += edge(n.sim, "r", n.score, "l", { label: "예측" });
  b += edge(n.score, "b", n.cal, "t");
  b += edge(n.score, "r", n.out, "l");
  b += note(60, 330, 260, "ⓘ 오프라인 엔진 — 런타임 시뮬과 분리.\n모델·가중치 신뢰성의 근거(BD팩에 사용).");
  return doc(W, H, "⑦ 검증 / 백테스트 엔진", "validation/ · 정답 대비 정확도 측정", b);
};

// ── 08 QUALITY AUDIT ───────────────────────────────────────────────────────
diagrams["08-quality-audit"] = () => {
  const W = 960, H = 560; const n = {};
  n.in = { x: 360, y: 80, w: 240, h: 40, color: "#0a1f4d", title: "SimulationResult", lines: [] };
  n.audit = { x: 330, y: 150, w: 300, h: 50, color: C.qa, title: "ƒ auditQuality(result)", lines: ["quality/audit.ts — 매 sim 후(비치명)"] };
  const checks = [
    ["voice-slip", "비원어 혼입률"], ["channel-mismatch", "마켓플레이스명 오류"],
    ["persona count", "목표 대비 수"], ["pricing sanity", "가격 타당 범위"],
    ["country dist", "국가 분포 균형"], ["dominance", "단일 반론 > 50%?"],
  ];
  checks.forEach((c, i) => { n["c" + i] = { x: 40 + (i % 3) * 310, y: 240 + Math.floor(i / 3) * 86, w: 290, h: 62, color: C.qa, title: c[0], lines: [c[1]] }; });
  n.out = { x: 330, y: 430, w: 300, h: 60, color: "#0a1f4d", title: "→ QualityAuditResult", lines: ["confidenceScore 0~100 · quarantined · warnings[]", "→ simulation_quality 테이블"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.in, "b", n.audit, "t");
  for (let i = 0; i < 6; i++) b += edge(n.audit, "b", n["c" + i], "t", { elbow: "v", color: "#fca5a5" });
  for (let i = 0; i < 6; i++) b += edge(n["c" + i], "b", n.out, "t", { color: "#fca5a5" });
  return doc(W, H, "⑧ 품질 감사 엔진", "quality/audit.ts · 매 시뮬 후 가드레일", b);
};

// ── 09 REPORT / PDF ────────────────────────────────────────────────────────
diagrams["09-report-pdf"] = () => {
  const W = 960, H = 540; const n = {};
  n.in = { x: 360, y: 90, w: 240, h: 44, color: "#0a1f4d", title: "앙상블/시뮬 결과", lines: ["aggregate_result"] };
  n.ens = { x: 120, y: 200, w: 320, h: 80, color: C.rep, title: "ensemble-pdf.tsx", lines: ["종합 리포트(React-PDF)", "국가·페르소나·가격·내러티브"] };
  n.val = { x: 520, y: 200, w: 320, h: 80, color: C.rep, title: "validation-pdf.tsx", lines: ["교차검증 리포트", "정확도 근거·방법론"] };
  n.tiers = { x: 280, y: 340, w: 400, h: 80, color: "#475569", title: "티어별 구성", lines: [
    "Executive (임원 ~5p) · Detailed (상세)", "Hypothesis (초기검증)", "PDF 다운로드 / 공유 링크"] };
  let b = Object.values(n).map(node).join("");
  b += edge(n.in, "b", n.ens, "t", { elbow: "v" });
  b += edge(n.in, "b", n.val, "t", { elbow: "v" });
  b += edge(n.ens, "b", n.tiers, "t", { elbow: "v" });
  b += edge(n.val, "b", n.tiers, "t", { elbow: "v" });
  return doc(W, H, "⑨ 리포트 / PDF 엔진", "src/lib/report/ · React-PDF 렌더", b);
};

// ── render all ──────────────────────────────────────────────────────────────
const names = Object.keys(diagrams);
for (const name of names) {
  const svg = diagrams[name]();
  const svgPath = join(OUT, name + ".svg");
  writeFileSync(svgPath, svg, "utf8");
}
// PNG 변환 (sharp, density로 선명하게)
const results = [];
for (const name of names) {
  const svgPath = join(OUT, name + ".svg");
  const pngPath = join(OUT, name + ".png");
  try {
    await sharp(svgPath, { density: 144 }).png().toFile(pngPath);
    results.push(name + ".svg + .png OK");
  } catch (e) {
    results.push(name + ".svg OK / PNG FAIL: " + e.message);
  }
}
console.log(results.join("\n"));
console.log("\n출력 폴더: " + OUT);
