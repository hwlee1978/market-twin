import { setRequestLocale } from "next-intl/server";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChallengeRecommendPanel } from "@/components/challenge/ChallengeRecommendPanel";

export const dynamic = "force-dynamic";

/**
 * 챌린지 시장진출 전략 추천 — 사용자 facing.
 * 기업 정보 입력 → 적합한 정부 지원사업 (내수) + 수출바우처 Top-K 매칭.
 *
 * 응모 챌린지 (2026 AI+ OpenData, 과제번호 20457281) Task 1 직접 구현체.
 */
export default async function ChallengePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        title="시장진출 전략 추천"
        subtitle="기업 정보 → 적합한 정부 지원사업 + 수출바우처 자동 매칭 (KOSME · KOMA 데이터)"
        icon={Target}
        iconTone="violet"
      />
      <ChallengeRecommendPanel />
    </div>
  );
}
