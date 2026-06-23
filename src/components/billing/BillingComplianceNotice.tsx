import { Link } from "@/i18n/navigation";
import { Receipt, ShieldCheck, RefreshCcw, Mail } from "lucide-react";

/**
 * 전자상거래법·전자금융거래법 컴플라이언스 공시 — 결제 페이지 하단에
 * 배치해 사용자가 결제 전 PG사·자동결제 갱신·해지·환불 조건을 명확히
 * 인지하도록.
 *
 * 항목 (메모리 ecommerce_subscription_compliance.md 의 6개):
 *   3. PG사 공개 (Stripe / TossPayments)
 *   2. 자동결제 7일 사전 안내
 *   6. 해지 절차 (가입과 동일 단계 수)
 *   환불 정책 링크
 */
export function BillingComplianceNotice({ locale }: { locale: "ko" | "en" }) {
  const isKo = locale === "ko";
  // 국내카드(KRW) PG가 나이스페이먼츠 단건결제로 전환됐는지. nicepay면 KRW는
  // 1회성 결제(자동갱신 없음)라 자동결제·해지 문구를 단건 기준으로 바꾼다.
  // USD(Stripe)는 어느 경우든 정기구독이므로 그 부분은 유지한다.
  const krwSingle = process.env.NEXT_PUBLIC_KRW_PROVIDER === "nicepay";
  const items: Array<{ icon: typeof Receipt; title: string; body: string }> = [
    {
      icon: ShieldCheck,
      title: isKo ? "결제대행사 (PG)" : "Payment processor",
      body: isKo
        ? `USD 결제: Stripe, Inc. (미국) · KRW 결제: ${krwSingle ? "나이스페이먼츠 주식회사" : "토스페이먼츠 주식회사"} (한국). 카드 정보는 PG사가 PCI-DSS Level 1 환경에서 직접 보관하며 회사 서버에 저장되지 않습니다.`
        : `USD payments processed by Stripe, Inc. KRW payments by ${krwSingle ? "NICE Payments" : "TossPayments"} (Korea). Card details are stored only by the PCI-DSS Level 1 PG provider, never on our servers.`,
    },
    {
      icon: Mail,
      title: isKo ? "결제 방식 안내" : "Billing notice",
      body: krwSingle
        ? isKo
          ? "해외카드(Stripe)는 정기구독으로, 갱신 7일 전 다음 결제 일자·금액을 이메일로 안내합니다 (전자상거래법 §15-3). 국내카드(나이스페이먼츠)는 1회성 결제로 자동갱신이 없으며, 이용기간 만료 시 계속 이용하려면 재결제가 필요합니다."
          : "International cards (Stripe) are recurring — we email a notice 7 days before each renewal. Korean cards (NICE Payments) are one-time charges with no auto-renewal; re-purchase to continue after the period ends."
        : isKo
          ? "구독 갱신 7일 전 등록 이메일로 다음 결제 일자·금액을 안내합니다 (전자상거래법 §15-3). 안내 후 7일 이내 해지 시 다음 결제는 청구되지 않습니다."
          : "We email a notice 7 days before each renewal with the upcoming charge date and amount. Cancel within that window and the next charge will not be processed.",
    },
    {
      icon: RefreshCcw,
      title: isKo ? "해지 절차" : "Cancellation",
      body: krwSingle
        ? isKo
          ? "해외카드 구독은 '구독 관리' → '해지' 2단계(가입 단계 수와 동일). 국내카드 1회성 결제는 자동결제가 없어 별도 해지가 필요 없으며, 이용기간 만료 시 자동 종료됩니다."
          : "International subscriptions: 'Manage' → 'Cancel' (2 steps). Korean one-time payments need no cancellation — access simply ends when the period expires."
        : isKo
          ? "결제 페이지의 '구독 관리' → '해지' 2단계 (가입 단계 수와 동일). 해지 즉시 다음 결제 차단, 현재 결제 기간 만료일까지 서비스 이용 가능."
          : "Subscription page → 'Manage' → 'Cancel' (2 steps, same as signup). Cancellation stops the next charge; service remains available until the current period end.",
    },
    {
      icon: Receipt,
      title: isKo ? "환불 정책" : "Refund policy",
      body: isKo
        ? "결제일 7일 이내 + 시뮬레이션 0건 사용 시 전액 환불. 이후는 일할 계산. 상세는 환불정책 페이지 참조."
        : "Full refund within 7 days of payment if no simulation was used. After that, prorated refund. See refund policy for details.",
    },
  ];

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/40 px-6 py-5">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">
        {isKo ? "결제 안내 (전자상거래법·전자금융거래법)" : "Payment disclosures"}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {items.map((it) => (
          <div key={it.title} className="flex items-start gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              <it.icon className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-800">{it.title}</div>
              <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                {it.body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <Link href="/refund" className="hover:text-slate-900 underline">
          {isKo ? "환불 정책" : "Refund policy"}
        </Link>
        <Link href="/terms" className="hover:text-slate-900 underline">
          {isKo ? "이용약관" : "Terms of service"}
        </Link>
        <Link href="/privacy" className="hover:text-slate-900 underline">
          {isKo ? "개인정보처리방침" : "Privacy policy"}
        </Link>
        <span className="ml-auto">
          {isKo
            ? "사업자등록번호 693-87-03907 · 통신판매업신고 제2026-용인수지-2253호"
            : "Mr.AI Inc. · KR Mail-Order Business Reg. 2026-Yongin-Suji-2253"}
        </span>
      </div>
    </section>
  );
}
