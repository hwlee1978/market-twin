import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback"];

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
    // Skip all internal paths (_next), static, api, and public files
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
