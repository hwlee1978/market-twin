import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ChevronLeft, ExternalLink, MessageCircle, Users } from "lucide-react";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VirtualSpaceFeed } from "@/components/mrai/VirtualSpaceFeed";
import { ContentDraftsPanel } from "@/components/mrai/ContentDraftsPanel";
import { ChannelEditButton } from "@/components/mrai/ChannelEditButton";

export const dynamic = "force-dynamic";

const PLATFORM_META: Record<
  string,
  { label: string; icon: string; accent: string; bgGradient: string }
> = {
  x_twitter: {
    label: "X (Twitter)",
    icon: "𝕏",
    accent: "text-slate-900",
    bgGradient: "from-slate-900 to-slate-700",
  },
  instagram: {
    label: "Instagram",
    icon: "📷",
    accent: "text-rose-700",
    bgGradient: "from-fuchsia-500 via-rose-500 to-amber-400",
  },
  youtube: {
    label: "YouTube",
    icon: "▶︎",
    accent: "text-red-700",
    bgGradient: "from-red-600 to-red-800",
  },
  naver_blog: {
    label: "네이버 블로그",
    icon: "N",
    accent: "text-emerald-700",
    bgGradient: "from-emerald-500 to-emerald-700",
  },
  tiktok: {
    label: "TikTok",
    icon: "🎵",
    accent: "text-slate-900",
    bgGradient: "from-slate-900 via-fuchsia-700 to-cyan-500",
  },
  threads: {
    label: "Threads",
    icon: "@",
    accent: "text-slate-900",
    bgGradient: "from-slate-800 to-slate-600",
  },
  kakao_channel: {
    label: "카카오 채널",
    icon: "💬",
    accent: "text-amber-700",
    bgGradient: "from-yellow-400 to-amber-500",
  },
  naver_smartstore: {
    label: "네이버 스마트스토어",
    icon: "🛒",
    accent: "text-emerald-700",
    bgGradient: "from-emerald-500 to-teal-600",
  },
  facebook: {
    label: "Facebook",
    icon: "f",
    accent: "text-blue-700",
    bgGradient: "from-blue-600 to-blue-800",
  },
  linkedin: {
    label: "LinkedIn",
    icon: "in",
    accent: "text-sky-800",
    bgGradient: "from-sky-700 to-sky-900",
  },
  reddit: {
    label: "Reddit",
    icon: "r/",
    accent: "text-orange-700",
    bgGradient: "from-orange-500 to-orange-700",
  },
  other: {
    label: "기타",
    icon: "🔗",
    accent: "text-slate-700",
    bgGradient: "from-slate-500 to-slate-700",
  },
};

type Channel = {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  market_country: string | null;
  target_segments: string[];
  posting_style: string | null;
  bio_text: string | null;
  enabled: boolean;
};

type Persona = {
  id: string;
  age_range: string;
  gender: string;
  country: string;
  income_band: string;
  profession: string;
  base_profession: string;
  interests: string[];
  purchase_style: string;
  price_sensitivity: string;
};

export default async function VirtualSpacePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) redirect(`/${locale}`);

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("mrai_marketing_channels")
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, enabled",
    )
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single<Channel>();

  if (!channel) notFound();

  // Persona pool is global as of v0.1 (see runner.ts shared-pool note) —
  // the count + audience preview here read across every workspace's
  // origin-tagged personas. Without the workspace filter Markettwin
  // (and other new tenants) see the real cross-tenant pool instead of
  // a stale "0명" zero state.
  let personasQuery = supabase
    .from("personas")
    .select(
      "id, age_range, gender, country, income_band, profession, base_profession, interests, purchase_style, price_sensitivity",
      { count: "exact" },
    )
    .order("use_count", { ascending: true })
    .limit(48);
  if (channel.market_country) {
    personasQuery = personasQuery.eq("country", channel.market_country);
  }
  const { data: personas, count: personaTotal } = await personasQuery;

  const meta = PLATFORM_META[channel.platform] ?? PLATFORM_META.other;

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/${locale}/mr-ai`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Mr. AI로 돌아가기
        </Link>
        <Link
          href={`/${locale}/mr-ai/channels/${channel.id}/preview`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 text-white text-xs font-semibold hover:opacity-90 shadow-sm"
        >
          ▶ 실제처럼 보기 (가상 {channel.platform === "instagram" ? "IG" : channel.platform === "x_twitter" ? "X" : channel.platform === "tiktok" ? "TikTok" : "피드"})
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className={`rounded-xl border border-slate-200 overflow-hidden shadow-sm`}>
        <div
          className={`bg-gradient-to-br ${meta.bgGradient} px-6 py-8 text-white`}
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-3xl font-bold">
              {meta.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider opacity-80">
                {meta.label}
              </div>
              <h1 className="text-2xl font-bold mt-0.5">
                {channel.display_name ?? channel.handle}
              </h1>
              <div className="text-sm opacity-80 font-mono mt-0.5">
                @{channel.handle}
              </div>
              {channel.bio_text && (
                <p className="text-sm mt-3 opacity-90 max-w-2xl whitespace-pre-line leading-snug">
                  {channel.bio_text}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {channel.market_country && (
                  <span className="text-[11px] font-semibold uppercase tracking-wider bg-white/20 px-2 py-1 rounded">
                    🌍 {channel.market_country}
                  </span>
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wider bg-white/20 px-2 py-1 rounded">
                  <Users className="w-3 h-3 inline mr-1" />
                  {personaTotal ?? 0}명 잠재 청중
                </span>
                {!channel.enabled && (
                  <span className="text-[11px] uppercase bg-red-500/30 px-2 py-1 rounded">
                    disabled
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audience: personas living in this space — collapsed by default */}
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm group">
        <summary className="px-5 py-4 cursor-pointer list-none flex items-start justify-between hover:bg-slate-50/50 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              이 공간에 살고 있는 페르소나
              <span className="text-[10px] font-normal text-slate-400 group-open:hidden">
                ▶ 펼치기
              </span>
              <span className="text-[10px] font-normal text-slate-400 hidden group-open:inline">
                ▼ 접기
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {channel.market_country
                ? `${channel.market_country} 시장 풀에서 매칭. 콘텐츠 업로드 시 이들이 좋아요/댓글/공유를 시뮬레이션합니다.`
                : "워크스페이스 전체 페르소나가 잠재 청중입니다."}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-slate-900">
              {personaTotal ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              매칭 페르소나
            </div>
          </div>
        </summary>
        <div className="px-5 py-4 border-t border-slate-100">
          {!personas || personas.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">
              아직 {channel.market_country ?? "이 워크스페이스"} 시장의 페르소나가 없습니다.
              <br />
              시뮬레이션을 1회 이상 실행하면 페르소나 풀이 쌓이기 시작합니다.
              <div className="mt-3">
                <Link
                  href={`/${locale}`}
                  className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-medium"
                >
                  → 시뮬레이션 실행하기
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(personas as Persona[]).map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                      {p.gender === "female" || p.gender === "여" ? "♀" : p.gender === "male" || p.gender === "남" ? "♂" : "•"}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">
                        {p.age_range} · {p.country}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {p.income_band}
                      </div>
                    </div>
                  </div>
                  <div className="text-slate-700 font-medium leading-snug truncate">
                    {p.profession}
                  </div>
                  {p.interests.length > 0 && (
                    <div className="mt-1.5 text-[10px] text-slate-500 line-clamp-2">
                      {p.interests.slice(0, 4).join(" · ")}
                    </div>
                  )}
                  <div className="mt-1.5 flex gap-1 flex-wrap">
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {p.price_sensitivity}
                    </span>
                    <span className="text-[9px] text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                      {p.purchase_style}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* Posting style preview — editable */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-amber-600" />
            포스팅 전략
          </h2>
          <ChannelEditButton
            channel={{
              id: channel.id,
              display_name: channel.display_name,
              market_country: channel.market_country,
              target_segments: channel.target_segments,
              posting_style: channel.posting_style,
              bio_text: channel.bio_text,
            }}
          />
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          {channel.target_segments.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                타겟 세그먼트
              </div>
              <div className="flex flex-wrap gap-1.5">
                {channel.target_segments.map((s, i) => (
                  <span
                    key={i}
                    className="text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              타겟 세그먼트가 설정되지 않았습니다. 우상단 "편집"으로 추가하세요.
            </p>
          )}
          {channel.posting_style ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                포스팅 톤/스타일
              </div>
              <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                {channel.posting_style}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              포스팅 톤이 설정되지 않았습니다. 드래프터가 일반적인 톤으로 카피를 작성합니다.
            </p>
          )}
        </div>
      </div>

      {/* Drafts: AI-generated copy + per-variant SEO scoring */}
      <ContentDraftsPanel channelId={channel.id} platform={channel.platform} />

      {/* Virtual feed — past publications + engagement totals */}
      <VirtualSpaceFeed channelId={channel.id} platform={channel.platform} />
    </div>
  );
}
