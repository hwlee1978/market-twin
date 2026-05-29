"use client";

import { useEffect, useState } from "react";
import { Heart, MessageSquare, Repeat2, Eye, Loader2, Megaphone } from "lucide-react";
import { EmptyState } from "./EmptyState";

type Publication = {
  id: string;
  published_at: string;
  total_likes: number;
  total_clicks: number;
  total_shares: number;
  total_comments: number;
  total_impressions: number;
  status: string;
  draft: {
    body_text: string;
    hashtags: string[] | null;
    cta_text: string | null;
    image_url: string | null;
    seo_meta: {
      translations?: {
        ko?: { body_text?: string | null; cta_text?: string | null };
      };
    } | null;
  } | null;
};

/**
 * Renders this virtual space's feed of published content + simulated
 * engagement totals. Sprint 1.5 ships the empty-state. Sprint 2 will
 * populate when content-drafter + persona-reactor LLMs land.
 */
export function VirtualSpaceFeed({
  channelId,
  platform,
}: {
  channelId: string;
  platform: string;
}) {
  const [pubs, setPubs] = useState<Publication[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/mrai/marketing-channels/${channelId}/publications`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setPubs([]);
          return;
        }
        const json = (await res.json()) as { publications: Publication[] };
        if (!cancelled) setPubs(json.publications ?? []);
      } catch {
        if (!cancelled) setPubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">
          최근 업로드 ({platformLabel(platform)} 피드)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          업로드 직후 페르소나 반응이 즉시 시뮬레이션되어 누적됩니다.
        </p>
      </div>
      <div className="px-5 py-4">
        {pubs === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 로딩…
          </div>
        ) : pubs.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            tone="rose"
            title="아직 업로드된 콘텐츠가 없어요"
            description="콘텐츠 드래프트 카드 하단의 '가상 피드에 퍼블리시' 버튼을 누르면 이 영역에 카드가 쌓이며 페르소나 반응이 누적됩니다."
          />
        ) : (
          <ul className="space-y-3">
            {pubs.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition"
              >
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                  {new Date(p.published_at).toLocaleString("ko-KR")}
                </div>
                {p.draft?.body_text && (
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-line line-clamp-4">
                    {p.draft.body_text}
                  </p>
                )}
                {p.draft?.seo_meta?.translations?.ko?.body_text && (
                  <div className="mt-1.5 pl-2.5 border-l-2 border-slate-200 text-xs text-slate-500 whitespace-pre-line line-clamp-4">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">
                      ↳ 한국어 번역
                    </div>
                    {p.draft.seo_meta.translations.ko.body_text}
                  </div>
                )}
                {p.draft?.hashtags && p.draft.hashtags.length > 0 && (
                  <div className="mt-1.5 text-xs text-sky-700">
                    {p.draft.hashtags.join(" ")}
                  </div>
                )}
                <div className="mt-3 flex gap-4 text-xs text-slate-600">
                  <Stat icon={<Heart className="w-3.5 h-3.5" />} value={p.total_likes} />
                  <Stat icon={<MessageSquare className="w-3.5 h-3.5" />} value={p.total_comments} />
                  <Stat icon={<Repeat2 className="w-3.5 h-3.5" />} value={p.total_shares} />
                  <Stat icon={<Eye className="w-3.5 h-3.5" />} value={p.total_impressions} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      <span>{Intl.NumberFormat("ko-KR").format(value)}</span>
    </span>
  );
}

function platformLabel(p: string): string {
  const m: Record<string, string> = {
    x_twitter: "X",
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    naver_blog: "네이버 블로그",
    threads: "Threads",
    kakao_channel: "카카오 채널",
    naver_smartstore: "스마트스토어",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    reddit: "Reddit",
  };
  return m[p] ?? p;
}
