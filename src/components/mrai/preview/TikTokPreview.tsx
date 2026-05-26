"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Share, Music, Loader2 } from "lucide-react";
import type { PreviewChannel } from "./InstagramPreview";

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
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TikTokPreview({
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
  const [activeIdx, setActiveIdx] = useState(0);

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
      setDrafts(rows.filter((d) => d.image_url));
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
  void audienceTotal;

  return (
    <div className="max-w-[420px] mx-auto bg-black min-h-screen relative">
      {drafts === null ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          이미지가 있는 드래프트가 없습니다.
        </div>
      ) : (
        (() => {
          const d = drafts[activeIdx];
          const sim = simByDraft[d.id];
          void sim;
          const likes = 0;
          const comments = 0;
          const shares = 0;
          return (
            <div className="relative h-screen overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.image_url!}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/30" />

              {/* Right sidebar with like/comment/share */}
              <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 text-white">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white bg-slate-200">
                  {avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <Heart className="w-9 h-9" />
                  <span className="text-xs mt-1">{fmtCount(likes)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <MessageCircle className="w-9 h-9" />
                  <span className="text-xs mt-1">{fmtCount(comments)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <Share className="w-9 h-9" />
                  <span className="text-xs mt-1">{fmtCount(shares)}</span>
                </div>
              </div>

              {/* Bottom caption */}
              <div className="absolute left-3 right-20 bottom-6 text-white">
                <div className="font-bold text-sm">
                  @{channel.handle}
                </div>
                <p className="text-sm whitespace-pre-line leading-snug mt-1 line-clamp-4">
                  {d.body_text}
                </p>
                {d.hashtags && (
                  <div className="text-sm font-semibold mt-1">{d.hashtags.join(" ")}</div>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <Music className="w-3 h-3" />
                  <span className="truncate">original sound · {channel.handle}</span>
                </div>
              </div>

              {/* Nav (next/prev video) */}
              {activeIdx > 0 && (
                <button
                  onClick={() => setActiveIdx((i) => i - 1)}
                  className="absolute top-1/3 left-1/2 -translate-x-1/2 text-white/60 text-xs"
                >
                  ↑ 이전 영상
                </button>
              )}
              {activeIdx < drafts.length - 1 && (
                <button
                  onClick={() => setActiveIdx((i) => i + 1)}
                  className="absolute bottom-1/3 left-1/2 -translate-x-1/2 text-white/60 text-xs"
                >
                  ↓ 다음 영상
                </button>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
