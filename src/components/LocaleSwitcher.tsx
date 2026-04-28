"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label={t("language")}
      className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"
      value={locale}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as "ko" | "en";
        startTransition(() => {
          router.replace(pathname, { locale: next });
        });
      }}
    >
      <option value="ko">{t("korean")}</option>
      <option value="en">{t("english")}</option>
    </select>
  );
}
