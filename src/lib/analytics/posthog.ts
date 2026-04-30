/**
 * Thin PostHog wrapper — keeps init guarded and gives the rest of the app
 * a tiny `capture()` / `identify()` surface that's safe to call before
 * init (no-ops). Init is gated by:
 *   1. NEXT_PUBLIC_POSTHOG_KEY being set (otherwise analytics is a no-op)
 *   2. cookie consent === "accepted" (handled by PostHogProvider)
 *
 * This module is "use client" because posthog-js touches window. Server
 * code must not import it.
 */
"use client";

import posthog from "posthog-js";

let initialized = false;

export function initPostHog(): boolean {
  if (typeof window === "undefined") return false;
  if (initialized) return true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // We track pageviews manually on App Router path changes, since
    // posthog-js's auto-pageview only fires on full page loads.
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    // Wait for user consent before sending anything; opt-in flips this on.
    opt_out_capturing_by_default: true,
  });
  initialized = true;
  return true;
}

export function capture(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, props);
}

export function identify(distinctId: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(distinctId, props);
}

export function resetIdentity(): void {
  if (!initialized) return;
  posthog.reset();
}

export function optIn(): void {
  if (!initialized) return;
  posthog.opt_in_capturing();
}

export function optOut(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
}
