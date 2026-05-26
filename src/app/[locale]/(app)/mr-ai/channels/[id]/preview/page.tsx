import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { InstagramPreview } from "@/components/mrai/preview/InstagramPreview";
import { TwitterPreview } from "@/components/mrai/preview/TwitterPreview";
import { TikTokPreview } from "@/components/mrai/preview/TikTokPreview";
import { GenericPreview } from "@/components/mrai/preview/GenericPreview";

export const dynamic = "force-dynamic";

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

/**
 * Virtual platform preview — renders the channel + its drafts as if
 * they were live on the real platform. Pulls latest persona-reaction
 * simulation data to populate like counts + comments, so the operator
 * can see "what would this actually look like in someone's feed?".
 *
 * Platform-specific renderers:
 *   instagram        → InstagramPreview (profile + 3-col grid + post detail)
 *   x_twitter / threads → TwitterPreview
 *   tiktok           → TikTokPreview
 *   else             → GenericPreview (placeholder timeline)
 */
export default async function ChannelPreviewPage({
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

  // Audience count — for "follower" display
  let audienceTotal = 0;
  if (channel.market_country) {
    const { count } = await supabase
      .from("personas")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("country", channel.market_country);
    audienceTotal = count ?? 0;
  }

  // First product brand asset as profile avatar
  const { data: avatarRow } = await supabase
    .from("mrai_brand_assets")
    .select("image_url")
    .eq("workspace_id", ctx.workspaceId)
    .eq("asset_type", "logo")
    .limit(1)
    .maybeSingle<{ image_url: string }>();
  let avatarUrl = avatarRow?.image_url ?? null;
  if (!avatarUrl) {
    const { data: anyAsset } = await supabase
      .from("mrai_brand_assets")
      .select("image_url")
      .eq("workspace_id", ctx.workspaceId)
      .limit(1)
      .maybeSingle<{ image_url: string }>();
    avatarUrl = anyAsset?.image_url ?? null;
  }

  const props = {
    channel,
    audienceTotal,
    avatarUrl,
    locale,
  };

  const platform = channel.platform;
  const Preview =
    platform === "instagram"
      ? InstagramPreview
      : platform === "x_twitter" || platform === "threads"
        ? TwitterPreview
        : platform === "tiktok"
          ? TikTokPreview
          : GenericPreview;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="px-4 pt-4 pb-2">
        <Link
          href={`/${locale}/mr-ai/channels/${id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> 가상 공간으로 돌아가기
        </Link>
      </div>
      <Preview {...props} />
    </div>
  );
}
