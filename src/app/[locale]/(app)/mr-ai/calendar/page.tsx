import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ChevronLeft, Calendar as CalendarIcon } from "lucide-react";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { ContentCalendar } from "@/components/mrai/ContentCalendar";

export const dynamic = "force-dynamic";

/**
 * Workspace-level content calendar — every channel's scheduled drafts
 * in one place. The Mr. AI cron will (Phase 1b.2) auto-publish at
 * scheduled_at; for now this is a planning view.
 */
export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) redirect(`/${locale}`);

  const supabase = await createClient();
  const { data: drafts } = await supabase
    .from("mrai_content_drafts")
    .select(
      `id, marketing_channel_id, variant_label, campaign_label, body_text,
       image_url, scheduled_at, created_at,
       channel:mrai_marketing_channels!marketing_channel_id(platform, handle, display_name)`,
    )
    .eq("workspace_id", ctx.workspaceId)
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  type ChannelInfo = {
    platform: string;
    handle: string;
    display_name: string | null;
  };
  type DraftRow = {
    id: string;
    marketing_channel_id: string;
    variant_label: string;
    campaign_label: string | null;
    body_text: string;
    image_url: string | null;
    scheduled_at: string;
    created_at: string;
    channel: ChannelInfo | ChannelInfo[] | null;
  };
  const rows = (drafts ?? []) as DraftRow[];
  const calendarDrafts = rows.map((r) => {
    const ch = Array.isArray(r.channel) ? r.channel[0] : r.channel;
    return {
      id: r.id,
      channelId: r.marketing_channel_id,
      platform: ch?.platform ?? "other",
      handle: ch?.handle ?? "",
      displayName: ch?.display_name ?? null,
      variantLabel: r.variant_label,
      campaignLabel: r.campaign_label,
      bodyText: r.body_text,
      imageUrl: r.image_url,
      scheduledAt: r.scheduled_at,
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/${locale}/mr-ai`}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Mr. AI 대시보드
          </Link>
        </div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-indigo-600" />
          콘텐츠 캘린더
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          모든 채널의 스케줄된 드래프트를 한 눈에. 클릭해서 채널 상세로 이동.
          {" "}
          Phase 1b.2 자동 발행 cron은 다음 ship에.
        </p>

        <div className="mt-6">
          <ContentCalendar locale={locale} drafts={calendarDrafts} />
        </div>
      </div>
    </div>
  );
}
