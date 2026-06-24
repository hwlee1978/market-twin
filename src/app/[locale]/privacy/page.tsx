import { redirect } from "next/navigation";

/**
 * 개인정보처리방침 정본은 마케팅 사이트(markettwin.ai)에 단일 유지한다.
 * 앱 내부(i18n) 별도본과 문구가 갈리던 것을 없애기 위해 앱 /privacy는
 * 마케팅 정본으로 리다이렉트한다. 로케일별로 국문/영문 정본에 매핑.
 */
export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(
    locale === "en"
      ? "https://markettwin.ai/privacy-en.html"
      : "https://markettwin.ai/privacy.html",
  );
}
