import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth + email confirmation callback. Lives outside the [locale] segment so the
// redirect URL we hand to Supabase is locale-stable.
//
// MUST be dynamic because we read query params + request headers + cookies
// (via Supabase createClient). Without force-dynamic, Next.js tries to
// statically prerender at build time, fails silently, and serves a 404 in
// production — exactly the symptom user saw post-OAuth.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user && data.user.email) {
        const meta = (data.user.user_metadata ?? {}) as { welcome_sent_at?: string };
        if (!meta.welcome_sent_at) {
          // Stamp BEFORE send so a retry that lands here again doesn't
          // double-send if email succeeds but stamp fails. Either we send
          // once or we skip — never twice.
          await supabase.auth.updateUser({
            data: { ...meta, welcome_sent_at: new Date().toISOString() },
          });
          // Dynamic import keeps Resend SDK out of the cold-start critical
          // path. Earlier static import was a suspected (incorrect) cause
          // of the route 404 — kept dynamic for safety + faster TTFB on
          // OAuth callback even if it adds a few ms to the email send.
          const userEmail = data.user.email;
          void import("@/lib/email/notify")
            .then(({ notifyWelcome }) => notifyWelcome({ email: userEmail, locale }))
            .catch((e) => console.warn("[auth/callback] welcome email failed", e));
        }
      }
    } catch (err) {
      // Don't let auth bookkeeping errors block the redirect — the user
      // already authenticated successfully on Supabase side. Log + continue.
      console.error("[auth/callback] post-exchange error", err);
    }
  }

  // no-store: Vercel CDN previously cached a 404 from a broken deploy of
  // this route, which kept being served back even after the code was
  // fixed. Setting Cache-Control: no-store on every response (including
  // the 307 redirect) makes sure the edge never holds onto an outcome
  // again. Auth callbacks must always be fresh per-request anyway.
  const res = NextResponse.redirect(`${origin}${next}`);
  res.headers.set("cache-control", "no-store");
  return res;
}
