import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

/**
 * Root middleware — only handles the i18n routing piece. Sentry's tracing
 * still hooks in via instrumentation.ts so we don't need to wrap this.
 *
 * IMPORTANT: the matcher MUST exclude /auth/callback (OAuth + email confirm),
 * /api/*, and other handler-only paths. When the intl middleware tries to
 * locale-prefix those, it rewrites them into /[locale]/auth/callback which
 * has no route file, returning a 404 — Vercel then edge-caches that 404,
 * leaving the OAuth flow permanently broken until the cache is purged.
 *
 * Earlier attempt to remove middleware.ts entirely (due to a Sentry .nft.json
 * build conflict) caused this 404 issue, so we keep it and just carve out
 * the right paths instead.
 */
export default createMiddleware(routing);

export const config = {
  // Match every path EXCEPT:
  //   - /api/* — API routes never need locale prefixes
  //   - /auth/* — OAuth/email-confirm callbacks live outside [locale]
  //   - /monitoring/* — Sentry tunnel route (see next.config.ts tunnelRoute)
  //   - /_next/* — Next.js internals
  //   - Any path with a file extension (favicon, og-image, robots.txt, etc.)
  matcher: ["/((?!api|auth|monitoring|_next|.*\\..*).*)"],
};
