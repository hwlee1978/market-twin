"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  capture,
  identify,
  initPostHog,
  optIn,
  optOut,
  resetIdentity,
} from "@/lib/analytics/posthog";
import { getConsent } from "@/lib/cookie-consent";
import { createClient } from "@/lib/supabase/client";

/**
 * Bootstraps PostHog client-side, ties distinct_id to the Supabase user,
 * and emits a $pageview on every App Router path change. All analytics
 * calls are gated on cookie consent — if the user rejects, posthog is
 * never initialized and capture() is a no-op.
 *
 * Listens for the `cookie-consent-changed` event so flipping consent
 * mid-session enables tracking immediately without a reload.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 1) Init on mount if consent already given; otherwise wait for the banner.
  useEffect(() => {
    if (getConsent() === "accepted") {
      if (initPostHog()) optIn();
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "accepted") {
        if (initPostHog()) optIn();
      } else if (detail === "rejected") {
        optOut();
      }
    };
    window.addEventListener("cookie-consent-changed", handler);
    return () => window.removeEventListener("cookie-consent-changed", handler);
  }, []);

  // 2) Tie distinct_id to the Supabase user — picks up sessions restored
  // from cookies on first mount, plus any later sign-in / sign-out.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) identify(data.user.id, { email: data.user.email });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" && session) {
        identify(session.user.id, { email: session.user.email });
      } else if (evt === "SIGNED_OUT") {
        resetIdentity();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 3) Manual pageview on path change. Excludes search params on purpose —
  // we want funnel steps grouped by route, not by ?sim= IDs.
  useEffect(() => {
    capture("$pageview", { path: pathname });
  }, [pathname]);

  return <>{children}</>;
}
