import { NextResponse } from "next/server";
import { MRAI_ENABLED } from "./enabled";

/**
 * Mr.AI API gate.
 *
 * Call at the top of every /api/mrai/* route handler:
 *
 *   const gate = mraiGate();
 *   if (gate) return gate;
 *
 * Returns a 404 NextResponse when NEXT_PUBLIC_MRAI_ENABLED isn't
 * "true"; otherwise returns null (caller continues normally).
 *
 * We previously tried a root middleware.ts for this gate but the
 * Next.js build on Vercel crashed generating middleware.js.nft.json
 * (known Sentry-integration conflict). Per-route gating is verbose
 * but build-safe. Page-level gating still happens in
 * src/app/[locale]/(app)/mr-ai/layout.tsx.
 */
export function mraiGate(): NextResponse | null {
  if (!MRAI_ENABLED) {
    return NextResponse.json(
      { error: "mrai_not_enabled" },
      { status: 404 },
    );
  }
  return null;
}
