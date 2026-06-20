import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Shown in place of the new-project wizard when a beta (free_trial)
 * workspace has exhausted its trial — either the 2 free simulations are
 * used up, or the 7-day window has passed. Surfaces the "beta complete"
 * message at the '새 프로젝트' step so the user learns it up front rather
 * than after filling in the wizard and hitting a plan_limit on run.
 */
export function BetaTrialComplete({
  locale,
  reason,
}: {
  locale: string;
  /** "sims" = used up the free simulations; "expired" = 7-day window passed. */
  reason: "sims" | "expired";
}) {
  const isKo = locale === "ko";
  return (
    <div className="max-w-xl mx-auto mt-16 text-center px-6">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-50 text-brand mb-6">
        <CheckCircle2 size={32} />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        {isKo ? "베타테스트가 완료되었습니다 🎉" : "Your beta trial is complete 🎉"}
      </h1>
      <p className="text-slate-600 leading-relaxed mb-2">
        {isKo
          ? reason === "sims"
            ? "무료 체험 시뮬레이션 횟수를 모두 사용하셨습니다."
            : "무료 체험 기간(7일)이 종료되었습니다."
          : reason === "sims"
            ? "You've used up your free trial simulations."
            : "Your 7-day free trial period has ended."}
      </p>
      <p className="text-slate-600 leading-relaxed mb-8">
        {isKo
          ? "참여해 주셔서 감사합니다! 계속 이용하시려면 유료 플랜으로 업그레이드해 주세요."
          : "Thank you for taking part! To keep using Market Twin, please upgrade to a paid plan."}
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/plans"
          className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white hover:opacity-90 transition-opacity"
        >
          {isKo ? "플랜 보기 / 업그레이드" : "View plans / Upgrade"}
        </Link>
        <a
          href="mailto:contact@markettwin.ai"
          className="text-sm text-slate-500 hover:text-brand transition-colors"
        >
          {isKo ? "문의: contact@markettwin.ai" : "Contact: contact@markettwin.ai"}
        </a>
      </div>
    </div>
  );
}
