"use client";

import { useEffect, useState } from "react";
import { Heart, MessageSquare, Loader2, FileText } from "lucide-react";
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
  image_urls: Array<{ url: string; frame_index: number; size: string }> | null;
  seo_title: string | null;
  seo_meta: {
    translations?: {
      ko?: { body_text?: string | null; seo_title?: string | null };
    };
  } | null;
  created_at: string;
};

/**
 * Fallback preview used by platforms that don't have a dedicated
 * renderer yet (naver_blog, youtube, kakao_channel, smartstore,
 * facebook, linkedin, reddit, threads when not aliased to Twitter).
 *
 * Renders the channel's drafts as a simple chronological timeline
 * with title (if any), body, hashtags, image. Not platform-styled,
 * but the operator can at least review what the drafts say.
 */
export function GenericPreview({
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
    <div className="max-w-[760px] mx-auto bg-white border-x border-slate-200">
      {/* Channel header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={channel.handle}
              className="w-14 h-14 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">
              {channel.display_name || `@${channel.handle}`}
            </h1>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="uppercase tracking-wider text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                {channel.platform}
              </span>
              <span>@{channel.handle}</span>
              {channel.market_country && <span>· {channel.market_country}</span>}
              <span>· {audienceTotal.toLocaleString()} 청중</span>
            </div>
            {channel.bio_text && (
              <p className="text-xs text-slate-600 mt-2 whitespace-pre-line line-clamp-3">
                {channel.bio_text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Drafts timeline */}
      <div className="px-6 py-4">
        {drafts === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-8 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={FileText}
            tone="sky"
            title="이 채널에 드래프트가 없어요"
            description="가상 공간에서 콘텐츠를 생성하면 이 채널의 플랫폼에 맞춰 시간순으로 정리됩니다."
          />
        ) : (
          <ul className="space-y-5">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                  <span className="bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded font-semibold not-italic">
                    {d.variant_label}
                  </span>
                  {d.campaign_label && <span>· {d.campaign_label}</span>}
                  <span className="ml-auto">
                    {new Date(d.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                {d.seo_title && (
                  <h3 className="text-base font-semibold text-slate-900 mb-1">
                    {d.seo_title}
                  </h3>
                )}
                {d.seo_meta?.translations?.ko?.seo_title && (
                  <div className="text-xs text-slate-500 -mt-1 mb-1">
                    ↳ {d.seo_meta.translations.ko.seo_title}
                  </div>
                )}
                {d.image_url && (
                  <img
                    src={d.image_url}
                    alt=""
                    className="w-full max-h-72 object-cover rounded-md border border-slate-200 mt-2 mb-3"
                  />
                )}
                <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                  {d.body_text}
                </p>
                {d.seo_meta?.translations?.ko?.body_text && (
                  <div className="mt-2 pl-3 border-l-2 border-slate-200 text-xs text-slate-500 whitespace-pre-line leading-relaxed">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                      ↳ 한국어 번역
                    </div>
                    {d.seo_meta.translations.ko.body_text}
                  </div>
                )}
                {d.hashtags && d.hashtags.length > 0 && (
                  <div className="mt-2 text-xs text-sky-700">
                    {d.hashtags.join(" ")}
                  </div>
                )}
                {d.cta_text && (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                    {d.cta_text}
                  </div>
                )}
                <div className="mt-3 flex gap-4 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3 h-3" /> 0
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> 0
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
