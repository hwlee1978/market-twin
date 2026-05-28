import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyWelcome } from "@/lib/email/notify";

// OAuth + email confirmation callback. Lives outside the [locale] segment so the
// redirect URL we hand to Supabase is locale-stable.
//
// Side effect: once-only welcome email. We check user_metadata.welcome_sent_at
// before sending — Supabase users can hit this callback multiple times
// (re-confirm, OAuth re-link, etc.) and we don't want to spam them.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";

  // Locale prefix is REQUIRED on every in-app URL — without it the
  // next-intl middleware can't resolve the route and the user sees a
  // 404 right after Google OAuth completes. Detect from Accept-Language
  // (default ko) and prepend if the next path isn't already locale-prefixed.
  const accept = request.headers.get("accept-language") ?? "";
  const locale: "ko" | "en" = accept.startsWith("en") ? "en" : "ko";
  const next = /^\/(ko|en)(\/|$)/.test(rawNext) ? rawNext : `/${locale}${rawNext}`;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user && data.user.email) {
      const meta = (data.user.user_metadata ?? {}) as { welcome_sent_at?: string };
      if (!meta.welcome_sent_at) {
        // Fire welcome email + stamp metadata atomically. Stamp BEFORE
        // send so a retry that lands here again doesn't double-send if
        // the email succeeds but the stamp fails. (Either we send once
        // or we skip — never twice.)
        await supabase.auth.updateUser({
          data: { ...meta, welcome_sent_at: new Date().toISOString() },
        });
        // Don't await — keeps the redirect snappy. Email send is
        // best-effort and the notify wrapper swallows errors.
        void notifyWelcome({ email: data.user.email, locale });
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
