"use client";

import { useEffect, useState } from "react";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Grid3x3,
  Loader2,
} from "lucide-react";

export type PreviewChannel = {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  market_country: string | null;
  target_segments: string[];
  posting_style: string | null;
  bio_text: string | null;
};

type Draft = {
  id: string;
  variant_label: string;
  campaign_label: string | null;
  body_text: string;
  hashtags: string[] | null;
  cta_text: string | null;
  image_url: string | null;
  image_urls: Array<{ url: string; frame_index: number; size: string }> | null;
  seo_meta: { translations?: { ko?: { body_text?: string | null } } } | null;
  created_at: string;
};

type Simulation = {
  id: string;
  persona_sample_size: number;
  like_rate: number;
  comment_rate: number;
  reaction_distribution: Record<string, number>;
  top_positive_quotes: Array<{ quote: string; quote_ko?: string; persona: string }>;
  top_objection_quotes: Array<{
    quote: string;
    quote_ko?: string;
    persona: string;
    reason: string | null;
    reason_ko?: string | null;
  }>;
  created_at: string;
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일`;
  const wks = Math.floor(days / 7);
  return `${wks}주`;
}

export function InstagramPreview({
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
  const [openDraft, setOpenDraft] = useState<Draft | null>(null);

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
      // Fetch latest sim per draft (only those that have an image)
      for (const d of rows) {
        if (!d.image_url) continue;
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

  const displayName = channel.display_name ?? channel.handle;
  // Map persona pool size to a more believable follower count for IG aesthetic.
  // Real follower count would be: audienceTotal × % converted to follow. Use 4-6× audience for visual punch.
  const followerCount = Math.max(audienceTotal * 5, 247);
  const postCount = drafts?.filter((d) => d.image_url).length ?? 0;

  return (
    <div className="max-w-[935px] mx-auto bg-white border-x border-slate-200">
      {/* IG-style top header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3">
        <button className="text-slate-700">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-1 font-semibold text-slate-900">
          {channel.handle}
        </div>
        <button className="text-slate-700">
          <MoreHorizontal className="w-6 h-6" />
        </button>
      </div>

      {/* Profile section */}
      <div className="px-4 md:px-8 py-6">
        <div className="flex items-center gap-6 md:gap-10">
          <div className="shrink-0">
            <div className="w-20 h-20 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-slate-200 bg-gradient-to-br from-pink-400 via-purple-500 to-amber-400 p-[3px]">
              <div className="w-full h-full rounded-full overflow-hidden bg-white">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl md:text-4xl text-slate-400">
                    📷
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl text-slate-900">{channel.handle}</span>
              <button className="bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold px-4 py-1.5 rounded">
                팔로우
              </button>
              <button className="bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold px-4 py-1.5 rounded">
                메시지
              </button>
            </div>
            <div className="hidden md:flex gap-8 mt-4 text-sm text-slate-900">
              <span>
                게시물 <b>{postCount}</b>
              </span>
              <span>
                팔로워 <b>{fmtCount(followerCount)}</b>
              </span>
              <span>
                팔로잉 <b>342</b>
              </span>
            </div>
            <div className="hidden md:block mt-4">
              <div className="text-sm font-semibold text-slate-900">{displayName}</div>
              {channel.bio_text && (
                <div className="text-sm text-slate-800 whitespace-pre-line leading-snug">
                  {channel.bio_text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile stats + bio */}
        <div className="md:hidden mt-4">
          <div className="text-sm font-semibold text-slate-900">{displayName}</div>
          {channel.bio_text && (
            <div className="text-sm text-slate-800 whitespace-pre-line leading-snug">
              {channel.bio_text}
            </div>
          )}
          <div className="flex justify-around mt-4 py-3 border-y border-slate-200 text-center text-sm text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">{postCount}</div>
              <div>게시물</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">{fmtCount(followerCount)}</div>
              <div>팔로워</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">342</div>
              <div>팔로잉</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="border-t border-slate-200 flex justify-center">
        <button className="flex items-center gap-1 text-xs uppercase tracking-widest text-slate-900 font-semibold border-t-2 border-slate-900 -mt-px px-4 py-3">
          <Grid3x3 className="w-3 h-3" /> 게시물
        </button>
      </div>

      {/* 3-col grid of posts */}
      <div className="grid grid-cols-3 gap-[2px] md:gap-1">
        {drafts === null ? (
          <div className="col-span-3 py-20 text-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : drafts.filter((d) => d.image_url).length === 0 ? (
          <div className="col-span-3 py-20 text-center text-slate-400 text-sm">
            아직 이미지가 있는 드래프트가 없습니다. 가상 공간으로 돌아가 콘텐츠 + 이미지 생성하세요.
          </div>
        ) : (
          drafts
            .filter((d) => d.image_url)
            .map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenDraft(d)}
                className="aspect-square relative bg-slate-100 overflow-hidden group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.image_url!}
                  alt={d.variant_label}
                  className="w-full h-full object-cover"
                />
                {/* hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition flex items-center justify-center gap-6 text-white opacity-0 group-hover:opacity-100">
                  <span className="flex items-center gap-1 font-semibold">
                    <Heart className="w-5 h-5 fill-white" />
                    {simByDraft[d.id]
                      ? fmtCount(Math.round((simByDraft[d.id].like_rate / 100) * followerCount))
                      : "—"}
                  </span>
                  <span className="flex items-center gap-1 font-semibold">
                    <MessageCircle className="w-5 h-5 fill-white" />
                    {simByDraft[d.id]
                      ? fmtCount(Math.round((simByDraft[d.id].comment_rate / 100) * followerCount))
                      : "—"}
                  </span>
                </div>
                {d.image_urls && d.image_urls.length > 0 && (
                  <div className="absolute top-2 right-2 text-white text-xs">
                    <div className="bg-black/50 rounded-full w-6 h-6 flex items-center justify-center">
                      ⊞
                    </div>
                  </div>
                )}
              </button>
            ))
        )}
      </div>

      {/* Post detail modal */}
      {openDraft && (
        <PostDetailModal
          draft={openDraft}
          channel={channel}
          avatarUrl={avatarUrl}
          followerCount={followerCount}
          sim={simByDraft[openDraft.id]}
          onClose={() => setOpenDraft(null)}
        />
      )}
    </div>
  );
}

function PostDetailModal({
  draft,
  channel,
  avatarUrl,
  followerCount,
  sim,
  onClose,
}: {
  draft: Draft;
  channel: PreviewChannel;
  avatarUrl: string | null;
  followerCount: number;
  sim: Simulation | undefined;
  onClose: () => void;
}) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const carouselUrls = [
    draft.image_url,
    ...(draft.image_urls ?? []).map((g) => g.url),
  ].filter((u): u is string => Boolean(u));

  const totalSlides = carouselUrls.length;
  const koBody = draft.seo_meta?.translations?.ko?.body_text;

  const simLikes = sim
    ? Math.round((sim.like_rate / 100) * followerCount) + (liked ? 1 : 0)
    : liked
      ? 1
      : 0;
  const positiveComments = sim?.top_positive_quotes ?? [];
  const negativeComments = sim?.top_objection_quotes ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-2 md:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 text-white/80 hover:text-white"
      >
        <X className="w-6 h-6" />
      </button>
      <div
        className="bg-white rounded-md w-full max-w-[1024px] max-h-[92vh] flex flex-col md:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: image carousel */}
        <div className="md:w-3/5 bg-black flex items-center justify-center relative">
          <div className="w-full aspect-square relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={carouselUrls[carouselIndex]}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            {totalSlides > 1 && (
              <>
                {carouselIndex > 0 && (
                  <button
                    onClick={() => setCarouselIndex((i) => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-7 h-7 flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-900" />
                  </button>
                )}
                {carouselIndex < totalSlides - 1 && (
                  <button
                    onClick={() => setCarouselIndex((i) => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-7 h-7 flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-900" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                  {carouselUrls.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${
                        i === carouselIndex ? "bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: caption + actions + comments */}
        <div className="md:w-2/5 flex flex-col bg-white min-w-0">
          {/* Post header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
              {avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {channel.handle}
              </div>
              {channel.market_country && (
                <div className="text-[10px] text-slate-500">
                  {channel.market_country === "TW" ? "台北, 台灣" : channel.market_country}
                </div>
              )}
            </div>
            <button className="text-slate-700">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Caption + comments scrollable area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* Caption */}
            <div className="flex gap-3 mb-4">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                {avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-semibold text-slate-900">{channel.handle}</span>{" "}
                <span className="text-slate-900 whitespace-pre-line">
                  {draft.body_text}
                </span>
                {draft.hashtags && draft.hashtags.length > 0 && (
                  <div className="mt-1 text-sky-700">{draft.hashtags.join(" ")}</div>
                )}
                {koBody && (
                  <div className="mt-2 pl-2 border-l-2 border-slate-200 text-xs text-slate-500 whitespace-pre-line">
                    ↳ {koBody}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-2">{timeAgo(draft.created_at)}</div>
              </div>
            </div>

            {/* Persona comments — drawn from simulation */}
            {(positiveComments.length > 0 || negativeComments.length > 0) && (
              <div className="space-y-3">
                {positiveComments.slice(0, 5).map((q, i) => (
                  <CommentRow
                    key={`p${i}`}
                    persona={q.persona}
                    native={q.quote}
                    ko={q.quote_ko}
                    sentiment="positive"
                  />
                ))}
                {negativeComments.slice(0, 3).map((q, i) => (
                  <CommentRow
                    key={`n${i}`}
                    persona={q.persona}
                    native={q.quote}
                    ko={q.quote_ko}
                    sentiment="negative"
                  />
                ))}
              </div>
            )}

            {!sim && (
              <div className="rounded bg-slate-50 border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
                💡 이 드래프트에서 페르소나 반응 시뮬레이션을 돌리면 댓글이 여기 채워집니다.
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="border-t border-slate-200 px-3 py-2">
            <div className="flex items-center gap-3 text-slate-900">
              <button onClick={() => setLiked((l) => !l)}>
                <Heart
                  className={`w-6 h-6 ${liked ? "fill-red-500 text-red-500" : ""}`}
                />
              </button>
              <button>
                <MessageCircle className="w-6 h-6" />
              </button>
              <button>
                <Send className="w-6 h-6" />
              </button>
              <button onClick={() => setSaved((s) => !s)} className="ml-auto">
                <Bookmark className={`w-6 h-6 ${saved ? "fill-slate-900" : ""}`} />
              </button>
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              좋아요 {fmtCount(simLikes)}개
            </div>
            {sim && (
              <div className="text-[10px] text-slate-500">
                시뮬레이션 기반 · {sim.persona_sample_size}명 페르소나 × 추정 팔로워 {fmtCount(followerCount)} · 좋아요률 {sim.like_rate.toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  persona,
  native,
  ko,
  sentiment,
}: {
  persona: string;
  native: string;
  ko: string | undefined;
  sentiment: "positive" | "negative";
}) {
  const showKo = ko && ko.trim().length > 0 && ko.trim() !== native.trim();
  // Map persona "25-29 TW 디자이너" to a fake IG-ish handle
  const handle = persona.replace(/\s+/g, "").replace(/[^\w가-힣]/g, "").toLowerCase().slice(0, 20) || "user";
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 shrink-0 flex items-center justify-center text-white text-xs font-semibold">
        {persona.match(/[A-Z]{2}/)?.[0] ?? "•"}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <span className="font-semibold text-slate-900">{handle}</span>{" "}
        <span className="text-slate-900">{native}</span>
        {showKo && (
          <div className="text-xs text-slate-500 mt-0.5">↳ {ko}</div>
        )}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
          <span>방금 전</span>
          <span>답글 달기</span>
          {sentiment === "negative" && <span className="text-red-500">·  부정 반응</span>}
        </div>
      </div>
      <button className="text-slate-300 hover:text-slate-500 self-start">
        <Heart className="w-3 h-3" />
      </button>
    </div>
  );
}
