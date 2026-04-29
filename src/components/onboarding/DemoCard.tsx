import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { CountryChipRow } from "@/components/ui/CountryChip";
import { DemoLaunchButton } from "./DemoLaunchButton";

/**
 * Hero card a brand-new user sees on an empty dashboard / projects page.
 * Designed to be the first thing the eye lands on so trial conversion
 * doesn't stall on "what do I even type into this form?".
 */
export async function DemoCard() {
  const t = await getTranslations("onboarding.card");
  return (
    <div className="card p-8 border-brand-100 bg-gradient-to-br from-brand-50/50 via-white to-white">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 space-y-5">
          <div>
            <span className="inline-flex items-center gap-1.5 badge bg-brand-50 text-brand">
              <Sparkles size={12} />
              {t("badge")}
            </span>
            <h2 className="mt-3 text-xl font-semibold text-slate-900 tracking-tight">
              {t("title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-xl leading-relaxed">
              {t("description")}
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <Bullet />
              <span>{t("point1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Bullet />
              <span>{t("point2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Bullet />
              <span>{t("point3")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Bullet />
              <span>{t("point4")}</span>
            </li>
          </ul>

          <div>
            <DemoLaunchButton />
            <p className="mt-2 text-xs text-slate-500">{t("etaHint")}</p>
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t("preview.title")}
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label={t("preview.product")} value="AcousticPro Buds X1" mono />
            <Row label={t("preview.category")} value={t("preview.electronics")} />
            <Row label={t("preview.price")} value="$149" mono />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">{t("preview.countries")}</span>
              <CountryChipRow codes={["KR", "JP", "US"]} size="sm" />
            </div>
            <Row label={t("preview.personas")} value="50" mono />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <span
      aria-hidden
      className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-brand-300 shrink-0"
    />
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`text-slate-900 font-medium ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
