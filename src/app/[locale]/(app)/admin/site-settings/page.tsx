import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Settings } from "lucide-react";
import { requireSuperAdmin, SuperAdminAuthError } from "@/lib/auth/super-admin";
import { listAppSettings } from "@/lib/app-settings";
import { SiteSettingsPanel } from "@/components/admin/SiteSettingsPanel";

export const dynamic = "force-dynamic";

/**
 * Super-admin site-settings page. Lets the operator flip runtime
 * toggles (signup gate, future feature flags) without redeploy. Reads
 * from public.app_settings via service client, writes via the PATCH
 * endpoint at /api/admin/app-settings.
 */
export default async function SiteSettingsPage({
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
          title="사이트 설정 (제한 구역)"
          subtitle="슈퍼 어드민 전용"
          icon={Settings}
          iconTone="violet"
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mt-4">
          <h2 className="text-base font-semibold text-amber-800 mb-2">
            ⚠ 접근 권한 없음
          </h2>
          <p className="text-sm text-amber-900 leading-relaxed">
            {code === "not_authenticated"
              ? "먼저 로그인하세요."
              : code === "no_admins_configured"
                ? "SUPERADMIN_EMAILS 환경변수가 설정되지 않았습니다."
                : "슈퍼 어드민만 접근 가능합니다."}
          </p>
        </div>
      </div>
    );
  }

  const settings = await listAppSettings();

  return (
    <div className="px-6 pt-6 pb-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="사이트 설정"
        subtitle="런타임 토글 (재배포 없이 즉시 반영)"
        icon={Settings}
        iconTone="violet"
      />
      <SiteSettingsPanel initialSettings={settings} />
    </div>
  );
}
