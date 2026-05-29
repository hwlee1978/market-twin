"use client";

import { useEffect, useState } from "react";
import { Loader2, Eye, ThumbsUp, Play, BellRing, Video } from "lucide-react";
import type { PreviewChannel } from "./InstagramPreview";
import { EmptyState } from "../EmptyState";

type Draft = {
  id: string;
  variant_label: string;
  campaign_label: string | null;
  body_text: string;
  hashtags: string[] | null;
  image_url: string | null;
  image_urls: Array<{ url: string; frame_index: number; size: string }> | null;
  seo_title: string | null;
  seo_meta: {
    translations?: {
      ko?: { body_text?: string | null; seo_title?: string | null };
    };
    youtube?: { tags?: string[]; thumbnail_text?: string };
  } | null;
  created_at: string;
};

/**
 * YouTube channel preview — banner + channel header + video grid with
 * thumbnails, titles, view counts. Each draft renders as one "video".
 */
export function YouTubePreview({
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
      {/* Dark YT top bar */}
      <div className="bg-[#0f0f0f] text-white px-6 py-2 flex items-center gap-3 text-xs">
        <Play className="w-4 h-4 fill-red-600 text-red-600" />
        <span className="font-semibold tracking-tight">YouTube</span>
        <span className="ml-auto text-white/60">KR</span>
      </div>

      {/* Banner placeholder */}
      <div className="h-24 bg-gradient-to-r from-rose-200 via-orange-200 to-amber-100" />

      {/* Channel header */}
      <div className="px-8 py-6 flex items-start gap-5 border-b border-slate-200">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={channel.handle}
            className="w-24 h-24 rounded-full object-cover border-4 border-white -mt-12 shadow-sm"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-slate-200 border-4 border-white -mt-12" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 truncate">
            {channel.display_name || channel.handle}
          </h1>
          <div className="text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-3">
            <span>@{channel.handle}</span>
            <span>·</span>
            <span>{audienceTotal.toLocaleString()}명 구독</span>
            <span>·</span>
            <span>동영상 {drafts?.length ?? 0}개</span>
          </div>
          {channel.bio_text && (
            <p className="text-xs text-slate-500 mt-2 line-clamp-2">
              {channel.bio_text}
            </p>
          )}
        </div>
        <button
          type="button"
          className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5 hover:bg-slate-800"
        >
          <BellRing className="w-3.5 h-3.5" /> 구독
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 px-8 flex gap-6 text-sm">
        {["홈", "동영상", "Shorts", "재생목록", "커뮤니티", "정보"].map(
          (t, i) => (
            <button
              key={t}
              className={`py-3 ${
                i === 1
                  ? "text-slate-900 font-semibold border-b-2 border-slate-900"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          ),
        )}
      </div>

      {/* Video grid */}
      <div className="px-6 py-5">
        {drafts === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-10 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={Video}
            tone="rose"
            title="아직 동영상 드래프트가 없어요"
            description="가상 공간에서 콘텐츠 드래프트를 만들면 이 채널 그리드에 YouTube 영상처럼 썸네일·제목·조회수와 함께 나옵니다."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {drafts.map((d) => {
              const title =
                d.seo_title || d.body_text.split("\n")[0].slice(0, 60);
              const titleKo = d.seo_meta?.translations?.ko?.seo_title;
              const thumbText = d.seo_meta?.youtube?.thumbnail_text;
              return (
                <div key={d.id} className="group cursor-pointer">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                    {d.image_url ? (
                      <img
                        src={d.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <Play className="w-12 h-12" />
                      </div>
                    )}
                    {thumbText && (
                      <div className="absolute inset-x-3 top-3 text-white font-extrabold text-lg drop-shadow-lg leading-tight">
                        {thumbText}
                      </div>
                    )}
                    <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
                      0:42
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3">
                    {avatarUrl && (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-slate-700">
                        {title}
                      </h3>
                      {titleKo && titleKo !== title && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          ↳ {titleKo}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500 mt-1">
                        {channel.display_name || channel.handle}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5">
                          <Eye className="w-3 h-3" /> 0
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <ThumbsUp className="w-3 h-3" /> 0
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(d.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
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
