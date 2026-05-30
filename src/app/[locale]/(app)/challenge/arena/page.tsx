import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/**
 * Arena UI는 챌린지 판정기준 #2와 맞지 않아 (심사기관이 측정 주체)
 * 응모서에서 제외. /sme-strategy 랜딩으로 redirect.
 */
export default async function LegacyArenaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/sme-strategy", locale });
}
