import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/oauth-callback",
  "/privacy",
  "/terms",
  // 챌린지 응모/심사용 독립 페이지 — 인증 없이 평가 가능. 비인증 호출은
  // CHALLENGE_DEMO_WORKSPACE_ID env로 fallback (lib/challenge/context.ts).
  "/sme-strategy",
];

function isPublic(pathname: string) {
  // strip locale prefix for matching
  const stripped = pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
  if (stripped === "/") return true;
  return PUBLIC_PATHS.some((p) => stripped === p || stripped.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  // Run i18n middleware first to get locale routing applied
  const response = intlMiddleware(request);

  // Then run Supabase session refresh on the same response so cookies are propagated
  const { user } = await updateSession(request, response);

  if (!isPublic(request.nextUrl.pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip all internal paths (_next), static, api, auth callbacks,
    // monitoring tunnel, and any path with a file extension (favicon,
    // og-image, robots.txt, ...). Critical: /auth/* MUST be excluded so
    // the OAuth + email confirm callback at /auth/oauth-callback can
    // run its route handler instead of being locale-rewritten into
    // a non-existent /[locale]/auth/oauth-callback path (the cause of
    // the persistent post-Google-OAuth 404).
    "/((?!api|auth|monitoring|_next|_vercel|.*\\..*).*)",
  ],
};
