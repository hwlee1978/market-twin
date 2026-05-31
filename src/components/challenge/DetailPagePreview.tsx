"use client";

import { useState } from "react";
import { ShoppingBag, Heart, Share, Loader2, Video, Info } from "lucide-react";

type Spec = {
  headline: string;
  tagline: string;
  body: string;
  bullets: string[];
  cta: string;
};

type Locale = "ko" | "en" | "ja" | "zh-tw" | "zh-cn";

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
}: {
  spec: Record<Locale, Spec>;
  imageUrl?: string | null;
  productName?: string;
  /** 사용자가 입력한 KRW 정가. null이면 카테고리 기반 placeholder + warning. */
  priceKrw?: number | null;
  productCategory?: string;
}) {
  const [activeLocale, setActiveLocale] = useState<Locale>("ko");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const s = spec[activeLocale];
  const cta = s?.cta || LOCALE_CTA_FALLBACK[activeLocale];

  const generateVideo = async () => {
    if (!imageUrl) {
      setVideoError("이미지가 있어야 영상 생성 가능");
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    try {
      const res = await fetch("/api/challenge/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          motion_prompt: productName
            ? `${productName} product showcase, premium quality reveal`
            : undefined,
          duration: 5,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "video failed");
      }
      const json = (await res.json()) as { video_url: string };
      setVideoUrl(json.video_url);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "video failed");
    } finally {
      setVideoLoading(false);
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

      {/* Video generation footer */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="text-xs text-slate-600">
          {videoUrl
            ? "✓ 홍보영상 생성됨 (위 hero에서 재생 중)"
            : "Hero 영역을 정적 이미지 대신 3-4초 홍보영상으로 교체"}
        </div>
        {!videoUrl && (
          <button
            type="button"
            onClick={() => void generateVideo()}
            disabled={!imageUrl || videoLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-60"
          >
            {videoLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Video className="w-3.5 h-3.5" />
            )}
            {videoLoading ? "생성 중… (2-4분 소요, $0.50)" : "홍보영상 생성 (Kling Pro · 2-4분, $0.50)"}
          </button>
        )}
      </div>
      {videoError && (
        <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
          {videoError}
        </div>
      )}
    </section>
  );
}
