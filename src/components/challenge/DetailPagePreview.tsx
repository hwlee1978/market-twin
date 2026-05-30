"use client";

import { useState } from "react";
import { ShoppingBag, Heart, Share, Loader2, Video } from "lucide-react";

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

const PRICE_PLACEHOLDER: Record<Locale, string> = {
  ko: "₩159,000",
  en: "$119",
  ja: "¥16,800",
  "zh-tw": "NT$3,580",
  "zh-cn": "¥780",
};

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
}: {
  spec: Record<Locale, Spec>;
  imageUrl?: string | null;
  productName?: string;
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
        body: JSON.stringify({ image_url: imageUrl }),
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

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-rose-600">
                  {PRICE_PLACEHOLDER[activeLocale]}
                </span>
                <span className="text-xs text-slate-400 line-through">
                  {PRICE_PLACEHOLDER[activeLocale]}
                </span>
              </div>

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
            {videoLoading ? "생성 중… (~60s, ~$0.20)" : "홍보영상 생성"}
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
