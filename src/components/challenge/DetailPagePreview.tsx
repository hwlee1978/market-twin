"use client";

import { useState } from "react";
import { ShoppingBag, Heart, Share, Loader2, Video, Info, Download, Link2, Check } from "lucide-react";

type Spec = {
  headline: string;
  tagline: string;
  body: string;
  bullets: string[];
  cta: string;
};

type Locale = "ko" | "en" | "ja" | "zh-tw" | "zh-cn";

export type DetailPageData = {
  detail_specs: Array<{ label: string; value: string }>;
  usage_scenarios: Array<{ title: string; description: string }>;
  faq: Array<{ q: string; a: string }>;
};

const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어 (Smartstore 스타일)",
  en: "English (Global)",
  ja: "日本語",
  "zh-tw": "繁體中文 (Shopee TW)",
  "zh-cn": "简体中文 (Tmall)",
};

const LOCALE_CTA_FALLBACK: Record<Locale, string> = {
  ko: "구매하기",
  en: "Buy Now",
  ja: "購入する",
  "zh-tw": "立即購買",
  "zh-cn": "立即购买",
};

// 사용자 입력 KRW를 각 locale 통화로 환산. 환율은 2026-05 기준 근사치
// (정확도 < 실시간 환율 < 입점 시점 최종 결정). 실제 입점가는 별도 협의.
const FX_FROM_KRW: Record<Locale, { rate: number; symbol: string; roundTo: number }> = {
  ko: { rate: 1, symbol: "₩", roundTo: 100 },
  en: { rate: 1 / 1350, symbol: "$", roundTo: 1 },         // 1 USD ≈ 1,350 KRW
  ja: { rate: 1 / 9.2, symbol: "¥", roundTo: 10 },          // 100 KRW ≈ ¥10.86
  "zh-tw": { rate: 1 / 41.5, symbol: "NT$", roundTo: 10 },  // 1 TWD ≈ 41.5 KRW
  "zh-cn": { rate: 1 / 188, symbol: "¥", roundTo: 1 },      // 1 CNY ≈ 188 KRW
};

function formatLocalePrice(krw: number, loc: Locale): { current: string; original: string; discountPct: number } {
  const fx = FX_FROM_KRW[loc];
  const localCurrent = Math.round((krw * fx.rate) / fx.roundTo) * fx.roundTo;
  const localOriginal = Math.round((krw * 1.3 * fx.rate) / fx.roundTo) * fx.roundTo;
  const discountPct = Math.round(((localOriginal - localCurrent) / localOriginal) * 100);
  return {
    current: `${fx.symbol}${localCurrent.toLocaleString()}`,
    original: `${fx.symbol}${localOriginal.toLocaleString()}`,
    discountPct,
  };
}

// 가격 미입력 시 카테고리 기반 현실적 placeholder (KRW). 사용자에게
// "placeholder임" warning 명시 — 실제 입점가와 다를 수 있음.
function guessFallbackPriceKrw(productName?: string, productCategory?: string): number {
  const text = `${productCategory ?? ""} ${productName ?? ""}`.toLowerCase();
  if (/라면|noodle/.test(text)) return 1800;
  if (/스낵|과자|초콜릿|쿠키|snack|cookie/.test(text)) return 3000;
  if (/음료|커피|차|주스|drink|beverage|coffee/.test(text)) return 3500;
  if (/주류|소주|맥주|와인|위스키|alcohol|liquor/.test(text)) return 29000;
  if (/홍삼|건강기능|영양제|health|supplement|ginseng/.test(text)) return 250000;
  if (/스니커즈|신발|운동화|구두|sneaker|shoe|footwear/.test(text)) return 159000;
  if (/티셔츠|셔츠|의류|패션|apparel|fashion|shirt/.test(text)) return 89000;
  if (/전자|가전|tv|스마트폰|이어폰|electronic|appliance/.test(text)) return 290000;
  if (/쿠션|파운데이션|립|마스크|크림|에센스|cosmetic|cushion|foundation|mask|essence/.test(text)) return 35000;
  if (/스킨케어|skincare|toner|serum/.test(text)) return 49000;
  if (/주방|생활용품|home|kitchen/.test(text)) return 35000;
  return 50000; // default
}

/**
 * 챌린지 Task 2 ④ — 상세페이지 미리보기.
 *
 * MultilingualSpec + 이미지 + (선택) 영상을 받아 e-commerce 상세페이지
 * 형식으로 렌더링. 5개국어 모두 각 시장 친화적 layout으로 표시.
 *
 * - ko: 네이버 스마트스토어 스타일 (헤로 + 상세 정보 카드)
 * - en/ja: 글로벌 e-commerce 표준
 * - zh-tw/zh-cn: 가격·결제 노출 강조 (현지 컨버전 패턴)
 *
 * 영상 생성은 별도 버튼 (REPLICATE 비용 절감). 생성 후 hero 영역에 video 표시.
 */
export function DetailPagePreview({
  spec,
  imageUrl,
  productName,
  priceKrw,
  productCategory,
  detailPage,
}: {
  spec: Record<Locale, Spec>;
  imageUrl?: string | null;
  productName?: string;
  /** 사용자가 입력한 KRW 정가. null이면 카테고리 기반 placeholder + warning. */
  priceKrw?: number | null;
  productCategory?: string;
  /** 상세페이지 풍부한 데이터 (스펙 표·시나리오·FAQ). 한국어 전용. */
  detailPage?: DetailPageData;
}) {
  const [activeLocale, setActiveLocale] = useState<Locale>("ko");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Tier 옵션
  const [tier, setTier] = useState<"A" | "B" | "C">("A");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  type GeneratedClip = {
    scene: "single" | "reveal" | "scenario" | "closeup";
    video_url: string;
    motion_prompt: string;
    duration_sec: number;
  };
  const [clips, setClips] = useState<GeneratedClip[]>([]);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [videoCostUsd, setVideoCostUsd] = useState<number | null>(null);
  const [videoGenerationMs, setVideoGenerationMs] = useState<number | null>(null);

  const s = spec[activeLocale];
  const cta = s?.cta || LOCALE_CTA_FALLBACK[activeLocale];

  // Tier C 보이스오버 텍스트 — ko spec의 tagline + body 첫 100자
  const voiceoverText = (() => {
    const ko = spec.ko;
    if (!ko) return "";
    const t = `${ko.tagline ?? ""} ${ko.body ?? ""}`.replace(/\s+/g, " ").trim();
    return t.slice(0, 300);
  })();

  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ done: number; total: number } | null>(null);

  type PredictionStatus = {
    prediction_id: string;
    scene: "single" | "reveal" | "scenario" | "closeup";
    motion_prompt: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    video_url?: string | null;
  };
  type JobResponse = {
    job_id: string;
    tier: "A" | "B" | "C";
    duration: 5 | 10;
    aspect_ratio: "16:9" | "9:16" | "1:1";
    status: "running" | "succeeded" | "failed" | "partial";
    predictions: PredictionStatus[];
    voiceover_url: string | null;
    total_cost_usd?: number;
  };

  const generateVideo = async () => {
    if (!imageUrl) {
      setVideoError("이미지가 있어야 영상 생성 가능");
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    setClips([]);
    setVoiceoverUrl(null);
    setVideoUrl(null);
    setVideoCostUsd(null);
    setVideoGenerationMs(null);
    setJobStatus("starting");
    setJobProgress(null);
    const tStart = Date.now();

    try {
      const body: Record<string, unknown> = {
        image_url: imageUrl,
        duration,
        aspect_ratio: aspectRatio,
        tier,
        product_name: productName,
        product_category: productCategory,
      };
      if (tier === "C" && voiceoverText) {
        body.voiceover_text = voiceoverText;
        body.voiceover_locale = "ko";
        body.voiceover_voice = "nova";
      }
      // 1. POST — Replicate prediction 생성 후 즉시 job_id 반환 (~30s)
      const res = await fetch("/api/challenge/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "";
        let code: string | null = null;
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          code = j.error ?? null;
          if (typeof j.detail === "string") detail = j.detail;
        } else {
          const text = await res.text().catch(() => "");
          detail = text.slice(0, 200).replace(/\s+/g, " ").trim();
        }
        throw new Error(`[HTTP ${res.status}] ${code ?? "video failed"}${detail ? ` — ${detail}` : ""}`);
      }
      const job = (await res.json()) as JobResponse;
      setJobStatus(job.status);
      if (job.voiceover_url) setVoiceoverUrl(job.voiceover_url);
      setJobProgress({ done: 0, total: job.predictions.length });

      // 2. GET /status?job_id 로 5초마다 polling
      const POLL_INTERVAL = 5000;
      const POLL_MAX_MS = 15 * 60 * 1000; // 15분 최대 (Tier C 10초 × 3)
      const tPollStart = Date.now();
      let finalJob: JobResponse | null = null;
      while (Date.now() - tPollStart < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const sres = await fetch(`/api/challenge/video/status?job_id=${job.job_id}`, {
          cache: "no-store",
        });
        if (!sres.ok) {
          console.warn(`[video/status] poll http ${sres.status}`);
          continue;
        }
        const s = (await sres.json()) as JobResponse;
        const done = s.predictions.filter(
          (p) => p.status === "succeeded" || p.status === "failed" || p.status === "canceled",
        ).length;
        setJobProgress({ done, total: s.predictions.length });
        setJobStatus(s.status);
        if (s.voiceover_url && !voiceoverUrl) setVoiceoverUrl(s.voiceover_url);
        if (s.status !== "running") {
          finalJob = s;
          break;
        }
      }
      if (!finalJob) throw new Error("polling timed out (15 min)");

      // 3. 결과 → clips state
      const succeededClips: GeneratedClip[] = finalJob.predictions
        .filter((p) => p.status === "succeeded" && p.video_url)
        .map((p) => ({
          scene: p.scene,
          video_url: p.video_url as string,
          motion_prompt: p.motion_prompt,
          duration_sec: finalJob!.duration,
        }));
      setClips(succeededClips);
      if (succeededClips.length > 0) setVideoUrl(succeededClips[0].video_url);
      setVideoCostUsd(finalJob.total_cost_usd ?? null);
      setVideoGenerationMs(Date.now() - tStart);

      if (finalJob.status === "failed") {
        const failedReasons = finalJob.predictions
          .filter((p) => p.status === "failed" || p.status === "canceled")
          .map((p) => `${p.scene}: ${p.status}`)
          .join(" | ");
        setVideoError(`전체 실패 — ${failedReasons}`);
      } else if (finalJob.status === "partial") {
        const failed = finalJob.predictions.length - succeededClips.length;
        setVideoError(`일부 실패 (${failed}/${finalJob.predictions.length}) — 성공한 영상만 표시`);
      }
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "video failed");
    } finally {
      setVideoLoading(false);
      setJobStatus(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-rose-600" />
          상세페이지 미리보기 (e-commerce 시뮬)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          locale 선택 → 시장별 상세페이지 + 홍보영상 (선택)
        </p>
      </header>

      {/* Locale tabs */}
      <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto">
        {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setActiveLocale(l)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-md border ${
              activeLocale === l
                ? "bg-rose-600 border-rose-600 text-white font-medium"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>

      {/* Detail page mockup */}
      <div className="p-5 bg-slate-50/30">
        {!s || !s.headline ? (
          <p className="text-xs text-slate-500 py-10 text-center">데이터 없음</p>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden max-w-[760px] mx-auto">
            {/* Hero — video if generated, else image */}
            <div className="aspect-[4/3] bg-slate-100 relative">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-cover"
                />
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={productName ?? ""} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">
                  이미지 없음
                </div>
              )}
              {/* Heart + Share buttons (mock interaction) */}
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-slate-700 hover:text-rose-600">
                  <Heart className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-slate-700">
                  <Share className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                  {s.headline}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{s.tagline}</p>
              </div>

              {(() => {
                const isFallback = !priceKrw || priceKrw <= 0;
                const effectiveKrw = isFallback
                  ? guessFallbackPriceKrw(productName, productCategory)
                  : priceKrw;
                const p = formatLocalePrice(effectiveKrw, activeLocale);
                return (
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-bold text-rose-600 px-1.5 py-0.5 rounded bg-rose-50">
                        {p.discountPct}%
                      </span>
                      <span className="text-2xl font-bold text-rose-600">{p.current}</span>
                      <span className="text-xs text-slate-400 line-through">{p.original}</span>
                    </div>
                    {isFallback && (
                      <div className="inline-flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          가격 데이터 미입력 — 카테고리 기반 가상 placeholder.
                          정확한 평가를 위해 상단 폼에 정가 KRW 입력 권장.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {s.bullets && s.bullets.length > 0 && (
                <ul className="space-y-1.5 border-y border-slate-100 py-3">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="text-sm text-slate-800 flex items-start gap-2">
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {s.body}
              </div>

              {/* 상세페이지 전용 풍부한 데이터 — locale 무관하게 한국어 표시
                  (실제 e-commerce도 한국어 페이지에서만 풀 옵션 노출).
                  ②번 다국어 상품 기술서와 차별화. */}
              {detailPage && activeLocale === "ko" && (
                <div className="pt-4 border-t border-slate-100 space-y-5">
                  {/* 상세 스펙 표 */}
                  {detailPage.detail_specs.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        상세 스펙
                      </h3>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          {detailPage.detail_specs.map((s, i) => (
                            <tr key={i}>
                              <td className="py-1.5 text-slate-500 w-28">{s.label}</td>
                              <td className="py-1.5 text-slate-900">{s.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 사용 시나리오 */}
                  {detailPage.usage_scenarios.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        사용 시나리오
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {detailPage.usage_scenarios.map((sc, i) => (
                          <div key={i} className="bg-slate-50 rounded-md p-3">
                            <div className="text-xs font-semibold text-slate-900 mb-1">{sc.title}</div>
                            <div className="text-xs text-slate-700 leading-relaxed">{sc.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* FAQ */}
                  {detailPage.faq.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        자주 묻는 질문
                      </h3>
                      <ul className="space-y-2">
                        {detailPage.faq.map((f, i) => (
                          <li key={i} className="border-l-2 border-slate-200 pl-3">
                            <div className="text-xs font-medium text-slate-900">Q. {f.q}</div>
                            <div className="text-xs text-slate-600 mt-0.5">A. {f.a}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 배송·환불 boilerplate */}
                  <div className="bg-slate-50 rounded-md p-3 text-[11px] text-slate-600 leading-relaxed">
                    <div className="font-semibold text-slate-700 mb-1">배송·환불 정보</div>
                    <div>· 평일 14시 이전 주문 시 당일 출고 (택배 1-3일 소요)</div>
                    <div>· 단순 변심 7일 내 교환·환불 가능 (왕복 배송비 고객 부담)</div>
                    <div>· 제품 하자 시 30일 내 무상 교환·환불</div>
                  </div>
                </div>
              )}

              {detailPage && activeLocale !== "ko" && (
                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 italic">
                  상세 스펙·사용 시나리오·FAQ는 한국어 페이지(KR Smartstore 스타일)에서만
                  표시됩니다. 다른 시장은 헤로·tagline·body 중심 간결 layout.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button className="flex-1 bg-slate-900 text-white py-3 rounded-md font-medium hover:bg-slate-800">
                  {cta}
                </button>
                <button className="px-4 bg-slate-100 text-slate-900 py-3 rounded-md font-medium hover:bg-slate-200">
                  ❤
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video generation — 3-tier 선택 UI */}
      <div className="border-t border-slate-200 bg-slate-50/60">
        <header className="px-5 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Video className="w-4 h-4 text-rose-600" />
              홍보영상 콘텐츠 — Tier 선택
            </div>
            {(clips.length > 0 || voiceoverUrl) && videoCostUsd !== null && (
              <div className="text-[11px] text-slate-500 tabular-nums">
                생성 {videoGenerationMs ? `${(videoGenerationMs / 1000).toFixed(0)}s` : ""} · ${videoCostUsd.toFixed(2)}
              </div>
            )}
          </div>
        </header>

        <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <TierCard
            label="Tier A"
            sub="단일 클립 (smart prompt)"
            desc="제품별 LLM 자동 모션 prompt · 2-4분 · 5초 $0.50 / 10초 $1.00"
            active={tier === "A"}
            onClick={() => setTier("A")}
          />
          <TierCard
            label="Tier B"
            sub="3-scene 스토리보드"
            desc="리빌+시나리오+클로즈업 sequential · 4-7분 · 5초 $1.50 / 10초 $3.00"
            active={tier === "B"}
            onClick={() => setTier("B")}
          />
          <TierCard
            label="Tier C"
            sub="+ TTS 보이스오버"
            desc="Tier B + Nova TTS 한국어 · 5-8분 · 5초 ~$1.50 / 10초 ~$3.00"
            active={tier === "C"}
            onClick={() => setTier("C")}
          />
        </div>

        {/* aspect / duration */}
        <div className="px-5 py-2 border-t border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Aspect:</span>
            {(["16:9", "9:16", "1:1"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspectRatio(a)}
                className={`px-2 py-1 rounded border ${aspectRatio === a ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Duration:</span>
            {([5, 10] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`px-2 py-1 rounded border ${duration === d ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {d}초
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void generateVideo()}
            disabled={!imageUrl || videoLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-60"
          >
            {videoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
            {videoLoading
              ? jobProgress
                ? `생성 중 ${jobProgress.done}/${jobProgress.total} (${jobStatus ?? "running"})`
                : "생성 시작 중…"
              : `Tier ${tier} 영상 생성 (~$${(() => {
                  const perClip = duration === 10 ? 1.0 : 0.5;
                  const clipCount = tier === "A" ? 1 : 3;
                  const tts = tier === "C" ? 0.005 : 0;
                  return (perClip * clipCount + tts).toFixed(2);
                })()})`}
          </button>
        </div>

        {!imageUrl && (
          <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-200">
            ⓘ 영상 생성에는 제품 이미지 URL이 필요합니다 (상단 폼).
          </div>
        )}

        {/* 결과 표시 */}
        {clips.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            <div className={`grid gap-3 ${clips.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}>
              {clips.map((c, i) => (
                <ClipCard key={i} clip={c} aspectRatio={aspectRatio} productName={productName} index={i} />
              ))}
            </div>

            {voiceoverUrl && (
              <div className="bg-violet-50 border border-violet-200 rounded-md p-3">
                <div className="text-[11px] font-semibold text-violet-700 mb-1.5">
                  🎙 한국어 보이스오버 (OpenAI TTS · Nova 보이스)
                </div>
                <audio src={voiceoverUrl} controls className="w-full" />
                <p className="text-[10px] text-violet-600 mt-1">
                  영상 위에 oever 가능 — HTML5 audio sync.
                </p>
              </div>
            )}
          </div>
        )}

        {videoError && (
          <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            {videoError}
          </div>
        )}
      </div>
    </section>
  );
}

type Clip = {
  scene: "single" | "reveal" | "scenario" | "closeup";
  video_url: string;
  motion_prompt: string;
  duration_sec: number;
};

function ClipCard({
  clip,
  aspectRatio,
  productName,
  index,
}: {
  clip: Clip;
  aspectRatio: "16:9" | "9:16" | "1:1";
  productName?: string;
  index: number;
}) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const sceneLabel =
    clip.scene === "reveal"
      ? "① 제품 리빌"
      : clip.scene === "scenario"
        ? "② 사용 시나리오"
        : clip.scene === "closeup"
          ? "③ 디테일 클로즈업"
          : "홍보영상";

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(clip.video_url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const downloadVideo = async () => {
    setDownloading(true);
    try {
      // CORS 우회 — fetch + blob + a[download] (Supabase Storage URL은 CORS 허용됨)
      const res = await fetch(clip.video_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (productName || "promo")
        .replace(/[^a-zA-Z0-9가-힣_-]+/g, "_")
        .slice(0, 40);
      a.download = `${safeName}_${clip.scene}_${index + 1}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // 다운로드 실패 시 → 새 탭으로 fallback
      window.open(clip.video_url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
      <div
        className={`bg-slate-100 ${
          aspectRatio === "9:16"
            ? "aspect-[9/16]"
            : aspectRatio === "1:1"
              ? "aspect-square"
              : "aspect-video"
        }`}
      >
        <video src={clip.video_url} controls autoPlay loop muted className="w-full h-full object-cover" />
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-900">
          {sceneLabel}
          <span className="text-slate-400 font-normal"> · {clip.duration_sec}초</span>
        </div>
        <p className="text-[10px] text-slate-500 line-clamp-2">
          <span className="text-slate-400">motion: </span>
          {clip.motion_prompt}
        </p>
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => void downloadVideo()}
            disabled={downloading}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            저장
          </button>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 text-[11px] font-medium hover:bg-slate-50"
          >
            {urlCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" /> 복사됨
              </>
            ) : (
              <>
                <Link2 className="w-3 h-3" /> URL
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TierCard({
  label,
  sub,
  desc,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-3 transition ${
        active
          ? "border-rose-500 bg-rose-50 ring-2 ring-rose-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-baseline justify-between mb-0.5">
        <span className={`text-xs font-bold ${active ? "text-rose-700" : "text-slate-900"}`}>{label}</span>
        {active && <span className="text-[10px] text-rose-600">✓ 선택됨</span>}
      </div>
      <div className={`text-xs font-semibold ${active ? "text-rose-900" : "text-slate-700"} mb-0.5`}>{sub}</div>
      <div className="text-[10px] text-slate-500 leading-relaxed">{desc}</div>
    </button>
  );
}
