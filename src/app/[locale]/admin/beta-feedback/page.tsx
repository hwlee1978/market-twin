import { setRequestLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import { AdminBetaFeedbackTable } from "@/components/admin/AdminBetaFeedbackTable";

export const dynamic = "force-dynamic";

/**
 * Operator view of anonymous feedback submitted from the public /beta page.
 * Read via service role (beta_public_feedback is RLS-locked with no policies);
 * operators can triage status new → reviewed → archived. Admin-gated by the
 * /admin layout. Bilingual via a simple isKo ternary (operator-only surface).
 */
export default async function AdminBetaFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale !== "en";

  const admin = createServiceClient();
  const { data } = await admin
    .from("beta_public_feedback")
    .select(
      "id, created_at, rating, category, message, name, email, locale, status",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  type Row = {
    id: string;
    created_at: string;
    rating: number | null;
    category: string | null;
    message: string;
    name: string | null;
    email: string | null;
    locale: string | null;
    status: string;
  };

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {isKo ? "베타 피드백" : "Beta Feedback"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isKo
            ? "공개 /beta 페이지에서 익명으로 제출된 피드백입니다. 상태로 분류해 처리하세요."
            : "Anonymous feedback submitted from the public /beta page. Triage by status."}
        </p>
      </div>
      <AdminBetaFeedbackTable rows={rows} isKo={isKo} />
    </div>
  );
}
