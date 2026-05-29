"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Repeat2, Share, Loader2, MessageSquare } from "lucide-react";
import type { PreviewChannel } from "./InstagramPreview";
import { EmptyState } from "../EmptyState";

type Draft = {
  id: string;
  variant_label: string;
  body_text: string;
  hashtags: string[] | null;
  image_url: string | null;
  seo_meta: { translations?: { ko?: { body_text?: string | null } } } | null;
  created_at: string;
};

type Simulation = {
  like_rate: number;
  comment_rate: number;
  share_rate: number;
  persona_sample_size: number;
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TwitterPreview({
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
  const [simByDraft, setSimByDraft] = useState<Record<string, Simulation>>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/mrai/marketing-channels/${channel.id}/drafts`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setDrafts([]);
        return;
      }
      const { drafts: rows } = (await res.json()) as { drafts: Draft[] };
      setDrafts(rows);
      for (const d of rows) {
        void (async () => {
          const r = await fetch(`/api/mrai/content-drafts/${d.id}/simulations`, {
            cache: "no-store",
          });
          if (!r.ok) return;
          const { simulations } = (await r.json()) as { simulations: Simulation[] };
          if (simulations.length > 0) {
            setSimByDraft((prev) => ({ ...prev, [d.id]: simulations[0] }));
          }
        })();
      }
    })();
  }, [channel.id]);

  const followers = channel.follower_count ?? 0;
  void audienceTotal; // persona pool is upper bound, reserved for future projection

  return (
    <div className="max-w-[600px] mx-auto bg-white border-x border-slate-200 min-h-screen">
      {/* Header banner */}
      <div className="h-32 bg-gradient-to-br from-slate-900 to-slate-700" />
      <div className="px-4 -mt-12 relative">
        <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-slate-100">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">𝕏</div>
          )}
        </div>
        <div className="flex justify-end -mt-12 mb-2">
          <button className="bg-slate-900 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:bg-slate-800">
            팔로우
          </button>
        </div>
        <div className="mt-1">
          <div className="text-xl font-bold text-slate-900">
            {channel.display_name ?? channel.handle}
          </div>
          <div className="text-sm text-slate-500">@{channel.handle}</div>
          {channel.bio_text && (
            <p className="text-sm text-slate-900 whitespace-pre-line mt-2">{channel.bio_text}</p>
          )}
          <div className="flex gap-4 mt-2 text-sm text-slate-700">
            <span>
              <b className="text-slate-900">0</b> 팔로잉
            </span>
            <span>
              <b className="text-slate-900">{fmtCount(followers)}</b> 팔로워
            </span>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 mt-4 flex">
        <button className="flex-1 py-3 text-center text-sm font-semibold text-slate-900 border-b-4 border-sky-500">
          게시물
        </button>
        <button className="flex-1 py-3 text-center text-sm text-slate-500 hover:bg-slate-50">
          답글
        </button>
        <button className="flex-1 py-3 text-center text-sm text-slate-500 hover:bg-slate-50">
          미디어
        </button>
        <button className="flex-1 py-3 text-center text-sm text-slate-500 hover:bg-slate-50">
          좋아요
        </button>
      </div>
      <div>
        {drafts === null ? (
          <div className="py-20 text-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            tone="sky"
            title="아직 트윗이 없어요"
            description="가상 공간에서 콘텐츠 드래프트를 만들면 X 타임라인처럼 여기 쌓이고 페르소나 반응이 시뮬됩니다."
          />
        ) : (
          drafts.map((d) => {
            // Pre-publish = 0; published posts will show real totals once
            // /publications endpoint is wired into this preview.
            const sim = simByDraft[d.id];
            void sim;
            const likes = 0;
            const replies = 0;
            const reposts = 0;
            return (
              <div
                key={d.id}
                className="px-4 py-3 border-b border-slate-200 hover:bg-slate-50/50 cursor-pointer"
              >
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                    {avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1 text-sm">
                      <span className="font-bold text-slate-900">
                        {channel.display_name ?? channel.handle}
                      </span>
                      <span className="text-slate-500">@{channel.handle}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-500">
                        {new Date(d.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    <p className="text-[15px] text-slate-900 whitespace-pre-line leading-snug mt-0.5">
                      {d.body_text}
                    </p>
                    {d.hashtags && d.hashtags.length > 0 && (
                      <p className="text-sky-600 text-sm mt-0.5">{d.hashtags.join(" ")}</p>
                    )}
                    {d.seo_meta?.translations?.ko?.body_text && (
                      <p className="text-xs text-slate-500 mt-1.5 pl-2 border-l-2 border-slate-200">
                        ↳ {d.seo_meta.translations.ko.body_text}
                      </p>
                    )}
                    {d.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.image_url}
                        alt=""
                        className="mt-3 rounded-xl border border-slate-200 max-h-96 object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between mt-3 max-w-md text-slate-500 text-sm">
                      <span className="flex items-center gap-1.5 hover:text-sky-600 cursor-pointer">
                        <MessageCircle className="w-4 h-4" /> {fmtCount(replies)}
                      </span>
                      <span className="flex items-center gap-1.5 hover:text-emerald-600 cursor-pointer">
                        <Repeat2 className="w-4 h-4" /> {fmtCount(reposts)}
                      </span>
                      <span className="flex items-center gap-1.5 hover:text-pink-600 cursor-pointer">
                        <Heart className="w-4 h-4" /> {fmtCount(likes)}
                      </span>
                      <span className="flex items-center gap-1.5 hover:text-sky-600 cursor-pointer">
                        <Share className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
