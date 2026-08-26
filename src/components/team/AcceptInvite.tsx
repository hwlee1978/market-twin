"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Confirms a seat invitation. Deliberately a button rather than an
 * on-render effect, so opening the link (or a mail client prefetching it)
 * never joins a workspace without an explicit action.
 */
export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("invite");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(t(errorKey(json.error) as "errors.generic"));
        setBusy(false);
        return;
      }
      // Keep the button disabled through the navigation — the accept API
      // already switched the active-workspace cookie, so a refresh is
      // needed for the shell to pick up the new workspace.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t("errors.generic"));
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? t("joining") : t("acceptCta")}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-rose-600 leading-relaxed">{error}</p>
      ) : null}
    </div>
  );
}

function errorKey(code: string | undefined): string {
  switch (code) {
    case "email_mismatch":
      return "errors.emailMismatch";
    case "expired":
      return "errors.expired";
    case "not_found":
      return "errors.notFound";
    case "seat_limit":
      return "errors.seatLimit";
    default:
      return "errors.generic";
  }
}
