import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js root middleware — Mr.AI feature-gate for API routes.
 *
 * Page-level guarding is handled by src/app/[locale]/(app)/mr-ai/layout.tsx
 * (notFound() on the entire /mr-ai/* segment). But /api/mrai/* doesn't
 * pass through that layout, so we gate it here instead. Returns a JSON
 * 404 when NEXT_PUBLIC_MRAI_ENABLED isn't "true".
 *
 * No-op (passes through immediately) for all non-Mr.AI requests, so
 * this should add no measurable latency.
 *
 * Decision rationale: memory product-split-terminology (2026-05-27).
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/mrai/")) {
    if (process.env.NEXT_PUBLIC_MRAI_ENABLED !== "true") {
      return NextResponse.json(
        { error: "mrai_not_enabled" },
        { status: 404 },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  // Only run middleware on Mr.AI API paths. Everything else short-
  // circuits without entering Node.
  matcher: ["/api/mrai/:path*"],
};
