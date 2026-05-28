import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// 60-second window: anyone whose auth.users.created_at sits within
// this many milliseconds of "now" is treated as a brand-new signup.
// Existing users hitting OAuth again will be well outside this window.
const NEW_USER_WINDOW_MS = 60_000;

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
        // Signup gate enforcement for OAuth path. The /signup page hides
        // the password form when SIGNUP_ENABLED!=true, but Supabase's
        // signInWithOAuth happily creates new users from Google regardless.
        // If this user was just created (within NEW_USER_WINDOW_MS) AND
        // signup is closed, delete them via the admin API + sign out +
        // bounce to the closed-signup screen. Existing users on a fresh
        // OAuth login skip this branch because their created_at is far
        // in the past.
        const signupOpen = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";
        const createdAt = data.user.created_at
          ? new Date(data.user.created_at).getTime()
          : 0;
        const isNewUser = Date.now() - createdAt < NEW_USER_WINDOW_MS;
        if (!signupOpen && isNewUser) {
          try {
            const admin = createServiceClient();
            await admin.auth.admin.deleteUser(data.user.id);
          } catch (delErr) {
            console.error("[auth/callback] gate delete failed", delErr);
          }
          await supabase.auth.signOut();
          const blocked = NextResponse.redirect(`${origin}/${locale}/signup?gated=oauth`);
          blocked.headers.set("cache-control", "no-store");
          return blocked;
        }

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
