import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/**
 * 기존 /challenge 경로를 새 챌린지 전용 페이지 /sme-strategy로 redirect.
 * Mr.AI 사이드바 안에서 보던 챌린지 UI는 새 독립 레이아웃으로 이동
 * (commit 2026-05-31).
 */
export default async function LegacyChallengePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/sme-strategy", locale });
}
