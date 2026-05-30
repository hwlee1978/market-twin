import { setRequestLocale } from "next-intl/server";
import { Swords } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArenaPanel } from "@/components/challenge/ArenaPanel";

export const dynamic = "force-dynamic";

/**
 * 챌린지 LMArena — 마케팅 콘텐츠 A/B 블라인드 평가.
 * 4개 LLM 중 랜덤 2개 선택 → 동일 prompt 생성 → 모델명 숨김 → 사용자 vote.
 *
 * 응모 챌린지 (2026 AI+ OpenData, 과제번호 20457281) 판정 #2 직접 구현체.
 */
export default async function ArenaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1200px] mx-auto space-y-6">
      <PageHeader
        title="콘텐츠 A/B Arena"
        subtitle="LMArena 방식 블라인드 평가 — 4개 LLM 중 어느 쪽이 더 좋은 마케팅 콘텐츠를 만드는지"
        icon={Swords}
        iconTone="rose"
      />
      <ArenaPanel />
    </div>
  );
}
