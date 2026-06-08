import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Database } from "lucide-react";
import { requireSuperAdmin, SuperAdminAuthError } from "@/lib/auth/super-admin";
import { ChallengeDataPanel } from "@/components/admin/ChallengeDataPanel";

export const dynamic = "force-dynamic";

/**
 * Super-admin 챌린지 데이터 탐색 페이지. KOSME + KOMA 제공 데이터
 * (판판대로 + 수출바우처) ingestion 상태와 sample row를 확인.
 *
 * Sprint Phase A.3 — Phase B (추천 모델) 학습 전 데이터 품질 검수용.
 */
export default async function ChallengeDataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  try {
    await requireSuperAdmin();
  } catch (e) {
    const code = e instanceof SuperAdminAuthError ? e.code : "unknown";
    return (
      <div className="px-6 pt-6 pb-10 max-w-3xl mx-auto">
        <PageHeader
          title="챌린지 데이터 (제한 구역)"
          subtitle="슈퍼 어드민 전용"
          icon={Database}
          iconTone="violet"
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mt-4">
          <h2 className="text-base font-semibold text-amber-800 mb-2">
            ⚠ 접근 권한 없음
          </h2>
          <p className="text-sm text-amber-900">
            {code === "not_authenticated"
              ? "먼저 로그인하세요."
              : "슈퍼 어드민만 접근 가능합니다."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="챌린지 데이터"
        subtitle="KOSME (판판대로) + KOMA (수출바우처) 제공 데이터 ingestion 상태"
        icon={Database}
        iconTone="violet"
      />
      <ChallengeDataPanel />
    </div>
  );
}
