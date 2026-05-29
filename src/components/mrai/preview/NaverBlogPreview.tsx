"use client";

import { useEffect, useState } from "react";
import { Loader2, Heart, MessageSquare, Search, BookOpen } from "lucide-react";
import type { PreviewChannel } from "./InstagramPreview";
import { EmptyState } from "../EmptyState";

type Draft = {
  id: string;
  variant_label: string;
  campaign_label: string | null;
  body_text: string;
  hashtags: string[] | null;
  cta_text: string | null;
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_meta: {
    translations?: {
      ko?: { body_text?: string | null; seo_title?: string | null };
    };
    naver_blog?: { category?: string };
  } | null;
  created_at: string;
};

/**
 * Naver Blog preview — mimics the signature 네이버 블로그 layout:
 * green header strip, blog title bar, post list with title/cover/snippet.
 */
export function NaverBlogPreview({
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
    <div className="max-w-[900px] mx-auto bg-white border-x border-slate-200">
      {/* Naver-green top strip */}
      <div className="bg-[#03c75a] text-white px-6 py-2 flex items-center gap-3 text-xs">
        <span className="font-bold text-base tracking-tight">NAVER</span>
        <span className="opacity-80">블로그</span>
        <div className="ml-auto flex items-center gap-1 bg-white/10 rounded px-2 py-0.5">
          <Search className="w-3 h-3" />
          <span className="opacity-90">검색</span>
        </div>
      </div>

      {/* Blog title bar */}
      <div className="border-b border-slate-200 px-6 py-5 flex items-center gap-4 bg-gradient-to-r from-emerald-50/40 to-white">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={channel.handle}
            className="w-16 h-16 rounded object-cover border border-slate-200"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-slate-100 border border-slate-200" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium">
            BLOG
          </div>
          <h1 className="text-xl font-bold text-slate-900 truncate mt-0.5">
            {channel.display_name || channel.handle}
          </h1>
          <div className="text-xs text-slate-500 mt-0.5">
            blog.naver.com/{channel.handle}
          </div>
          {channel.bio_text && (
            <p className="text-xs text-slate-600 mt-2 line-clamp-2">
              {channel.bio_text}
            </p>
          )}
          <div className="mt-2 text-[11px] text-slate-500">
            이웃 {audienceTotal.toLocaleString()}명
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="border-b border-slate-200 px-6 flex gap-5 text-xs">
        {["전체보기", "신상품", "스타일링", "후기", "공지"].map((cat, i) => (
          <button
            key={cat}
            className={`py-3 ${
              i === 0
                ? "text-slate-900 font-semibold border-b-2 border-[#03c75a]"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="px-6 py-6">
        {drafts === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-10 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            tone="emerald"
            title="아직 작성된 포스트가 없어요"
            description="가상 공간에서 콘텐츠 드래프트를 만들면 네이버 블로그 글 카드처럼 카테고리·SEO 제목과 함께 나옵니다."
          />
        ) : (
          <ul className="divide-y divide-slate-200">
            {drafts.map((d, idx) => {
              const title =
                d.seo_title || d.body_text.split("\n")[0].slice(0, 60);
              const titleKo = d.seo_meta?.translations?.ko?.seo_title;
              const category = d.seo_meta?.naver_blog?.category ?? "스타일";
              return (
                <li key={d.id} className="py-5 group">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                      {category}
                    </span>
                    {d.campaign_label && <span>· {d.campaign_label}</span>}
                    <span className="ml-auto">
                      {new Date(d.created_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 mb-1">
                    {idx === 0 && "📌 "}
                    {title}
                  </h2>
                  {titleKo && titleKo !== title && (
                    <div className="text-xs text-slate-500 mb-2">
                      ↳ {titleKo}
                    </div>
                  )}
                  {d.image_url && (
                    <img
                      src={d.image_url}
                      alt=""
                      className="w-full max-h-80 object-cover rounded border border-slate-200 my-3"
                    />
                  )}
                  <p className="text-sm text-slate-700 line-clamp-3 leading-relaxed">
                    {d.body_text}
                  </p>
                  {d.hashtags && d.hashtags.length > 0 && (
                    <div className="mt-2 text-xs text-emerald-700">
                      {d.hashtags.slice(0, 6).join(" ")}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3 h-3" /> 0
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> 0
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> 조회 0
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
