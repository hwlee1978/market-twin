"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const t = useTranslations("settings.session");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <button onClick={onSignOut} disabled={busy} className="btn-secondary">
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <LogOut size={14} />
      )}
      {t("signOut")}
    </button>
  );
}
