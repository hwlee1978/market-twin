import { redirect } from "next/navigation";

/**
 * 환불정책 정본도 마케팅 사이트(markettwin.ai)에 단일 유지한다. 앱 내부
 * (i18n) 별도본과의 불일치를 없애기 위해 앱 /refund를 마케팅 정본으로
 * 리다이렉트한다. 환불정책은 국내 KRW 결제 기준 단일 문서라 영문 전용
 * 페이지가 없어 ko/en 모두 refund.html로 보낸다.
 */
export default async function RefundPage() {
  redirect("https://markettwin.ai/refund.html");
}
