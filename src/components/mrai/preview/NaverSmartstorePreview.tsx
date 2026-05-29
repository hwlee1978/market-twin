"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, ShoppingCart, Star, Heart, Package } from "lucide-react";
import type { PreviewChannel } from "./InstagramPreview";
import { EmptyState } from "../EmptyState";

type Draft = {
  id: string;
  variant_label: string;
  campaign_label: string | null;
  body_text: string;
  hashtags: string[] | null;
  image_url: string | null;
  seo_title: string | null;
  seo_meta: {
    translations?: {
      ko?: { body_text?: string | null; seo_title?: string | null };
    };
  } | null;
  created_at: string;
};

/**
 * 스마트스토어 (네이버 쇼핑) product listing preview.
 * Each draft renders as a product card with mock price/rating/sold count.
 * Deterministic mock so the same draft always shows the same numbers.
 */
function mockProductStats(seed: string): {
  price: number;
  review: number;
  rating: number;
  sold: number;
} {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const price = 89000 + (h % 80) * 1000; // 89k ~ 168k
  const review = 12 + (h % 800);
  const rating = 4.3 + ((h % 7) / 10); // 4.3 ~ 4.9
  const sold = 50 + (h % 5000);
  return { price, review, rating: Math.round(rating * 10) / 10, sold };
}

export function NaverSmartstorePreview({
  channel,
  audienceTotal,
  avatarUrl,
}: {
  channel: PreviewChannel;
  audienceTotal: number;
  avatarUrl: string | null;
  locale: string;
}) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/mrai/marketing-channels/${channel.id}/drafts`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setDrafts([]);
          return;
        }
        const json = (await res.json()) as { drafts: Draft[] };
        if (!cancelled) setDrafts(json.drafts ?? []);
      } catch {
        if (!cancelled) setDrafts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel.id]);

  return (
    <div className="max-w-[1100px] mx-auto bg-white border-x border-slate-200">
      {/* Naver Shopping top strip */}
      <div className="bg-[#03c75a] text-white px-6 py-2 flex items-center gap-3 text-xs">
        <span className="font-bold text-base tracking-tight">NAVER</span>
        <span className="opacity-90">쇼핑</span>
        <div className="ml-auto flex items-center gap-1 bg-white/15 rounded px-3 py-1 min-w-[200px]">
          <Search className="w-3 h-3" />
          <span className="opacity-90 text-[11px]">검색어를 입력하세요</span>
        </div>
      </div>

      {/* Store header */}
      <div className="border-b border-slate-200 px-6 py-5 flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={channel.handle}
            className="w-16 h-16 rounded-lg object-cover border border-slate-200"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {channel.display_name || channel.handle}
            </h1>
            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
              스마트스토어
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            smartstore.naver.com/{channel.handle}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-3">
            <span>찜 {audienceTotal.toLocaleString()}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> 4.8 (3,124)
            </span>
          </div>
        </div>
        <button
          type="button"
          className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-3 py-1.5 rounded hover:bg-emerald-100"
        >
          ❤ 스토어찜
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 px-6 flex gap-6 text-xs">
        {["전체상품", "신상품", "베스트", "기획전", "공지"].map((t, i) => (
          <button
            key={t}
            className={`py-3 ${
              i === 0
                ? "text-emerald-700 font-semibold border-b-2 border-emerald-600"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="px-6 py-5">
        {drafts === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-10 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={Package}
            tone="emerald"
            title="등록된 상품이 없어요"
            description="가상 공간에서 상품 콘텐츠를 만들면 스마트스토어 그리드 형태로 썸네일·가격·별점과 함께 진열됩니다."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {drafts.map((d) => {
              const stats = mockProductStats(d.id);
              const title =
                d.seo_title || d.body_text.split("\n")[0].slice(0, 50);
              return (
                <div
                  key={d.id}
                  className="group cursor-pointer flex flex-col"
                >
                  <div className="relative aspect-square bg-slate-100 border border-slate-200 rounded-md overflow-hidden">
                    {d.image_url ? (
                      <img
                        src={d.image_url}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                        no image
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500"
                    >
                      <Heart className="w-3.5 h-3.5" />
                    </button>
                    {(stats.sold > 1000) && (
                      <span className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        BEST
                      </span>
                    )}
                  </div>
                  <div className="mt-2 px-0.5 flex-1 flex flex-col">
                    <h3 className="text-xs text-slate-700 line-clamp-2 leading-snug min-h-[2.2em]">
                      {title}
                    </h3>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {stats.price.toLocaleString()}원
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                        <span className="text-slate-700 font-medium">
                          {stats.rating}
                        </span>
                      </span>
                      <span>·</span>
                      <span>리뷰 {stats.review.toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      구매 {stats.sold.toLocaleString()}건
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-[11px] inline-flex items-center justify-center gap-1 px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <ShoppingCart className="w-3 h-3" /> 장바구니
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
