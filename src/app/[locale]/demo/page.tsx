import { redirect } from "next/navigation";

/**
 * Public marketing entry point — bounces straight to the share view
 * for the configured demo ensemble. Lives outside the (auth) and (app)
 * route groups so anonymous visitors can hit /demo from markettwin.ai
 * banners without seeing the login wall first.
 *
 * Setup: generate a permanent share token for one of your reference
 * ensembles (POST /api/ensembles/:id/share with very long TTL, or
 * leave share_expires_at null) and put it in .env.local /
 * Vercel envs as NEXT_PUBLIC_DEMO_SHARE_TOKEN.
 *
 * If the env var is missing, render a "demo coming soon" placeholder
 * so the route doesn't 500.
 */
export default async function DemoLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const token = process.env.NEXT_PUBLIC_DEMO_SHARE_TOKEN;
  if (token) {
    redirect(`/${locale}/share/ensemble/${token}`);
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          {locale === "ko" ? "데모 준비 중" : "Demo coming soon"}
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          {locale === "ko"
            ? "데모 토큰이 아직 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_DEMO_SHARE_TOKEN 을 넣어주세요."
            : "The demo share token isn't configured yet. Set NEXT_PUBLIC_DEMO_SHARE_TOKEN in your environment to enable this route."}
        </p>
        <a
          href={`/${locale}/login`}
          className="inline-block mt-6 text-sm text-brand hover:underline"
        >
          {locale === "ko" ? "로그인 페이지로" : "Go to login"}
        </a>
      </div>
    </div>
  );
}
