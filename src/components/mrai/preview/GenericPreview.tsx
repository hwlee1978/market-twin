"use client";

import type { PreviewChannel } from "./InstagramPreview";

export function GenericPreview({
  channel,
}: {
  channel: PreviewChannel;
  audienceTotal: number;
  avatarUrl: string | null;
  locale: string;
}) {
  return (
    <div className="max-w-[760px] mx-auto bg-white border-x border-slate-200 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        {channel.platform} 프리뷰는 곧 추가됩니다
      </h2>
      <p className="text-sm text-slate-500 mt-2">
        @{channel.handle} 채널의 드래프트는 가상 공간에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
