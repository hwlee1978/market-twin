import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { DemoLaunchButton } from "./DemoLaunchButton";

/**
 * The hero card a brand-new user sees when their dashboard or projects
 * page is empty. Shows: what we'll demo, why a demo (don't fill the
 * 6-step wizard cold), and one-click launch button. Designed to be
 * the first thing the eye lands on so trial conversion doesn't
 * stall on "what do I even type into this form?".
 */
export async function DemoCard() {
  const t = await getTranslations("onboarding.card");
  return (
    <div className="card border-brand-100 bg-gradient-to-br from-brand-50/40 to-transparent">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 badge bg-brand-50 text-brand mb-3">
            <Sparkles size={12} />
            {t("badge")}
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="mt-1.5 text-sm text-slate-600 max-w-xl leading-relaxed">
            {t("description")}
          </p>

          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700">
            <li>• {t("point1")}</li>
            <li>• {t("point2")}</li>
            <li>• {t("point3")}</li>
            <li>• {t("point4")}</li>
          </ul>

          <div className="mt-5">
            <DemoLaunchButton />
            <p className="mt-2 text-[11px] text-slate-500">{t("etaHint")}</p>
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0 rounded-lg border border-slate-200 bg-white p-4 text-xs space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("preview.title")}
          </div>
          <Row label={t("preview.product")} value="AcousticPro Buds X1" />
          <Row label={t("preview.category")} value={t("preview.electronics")} />
          <Row label={t("preview.price")} value="$149" />
          <Row label={t("preview.countries")} value="🇰🇷 🇯🇵 🇺🇸" />
          <Row label={t("preview.personas")} value="50" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}
