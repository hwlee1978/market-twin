"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Cookie } from "lucide-react";
import { getConsent, setConsent } from "@/lib/cookie-consent";

/**
 * Bottom-of-screen banner that appears on first visit and disappears
 * once the user makes a choice. Uses localStorage so it doesn't
 * spam returning users.
 *
 * Future analytics integrations should gate on getConsent() === "accepted"
 * before firing any tracking — see src/lib/cookie-consent.ts.
 */
export function CookieConsent() {
  const t = useTranslations("cookieConsent");
  // Start hidden to prevent flash on initial render before localStorage check.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === "unset") setVisible(true);
  }, []);

  if (!visible) return null;

  const handle = (next: "accepted" | "rejected") => {
    setConsent(next);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-md">
      <div className="card shadow-lg border-slate-200">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand shrink-0">
            <Cookie size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {t("title")}
            </div>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              {t("description")}{" "}
              <Link href="/privacy" className="text-brand hover:underline">
                {t("learnMore")}
              </Link>
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handle("accepted")}
                className="btn-primary text-xs px-3 py-1.5"
              >
                {t("accept")}
              </button>
              <button
                type="button"
                onClick={() => handle("rejected")}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                {t("reject")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
