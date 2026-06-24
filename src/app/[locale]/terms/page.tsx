import { redirect } from "next/navigation";

/**
 * 이용약관 정본은 마케팅 사이트(markettwin.ai)에 단일 유지한다. 과거 앱
 * 내부(i18n)에 별도 약관이 있어 마케팅 사이트본과 문구가 갈렸으므로(예:
 * 운영자 표기), 앱 /terms는 마케팅 정본으로 리다이렉트해 내용을 일원화한다.
 * 로케일별로 국문/영문 정본에 매핑.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(
    locale === "en"
      ? "https://markettwin.ai/terms-en.html"
      : "https://markettwin.ai/terms.html",
  );
}
