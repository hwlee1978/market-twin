/**
 * Lightweight cookie-consent helper. We don't load any analytics yet,
 * but stub the consent state now so the banner can be wired and any
 * future analytics integration (PostHog, Plausible, etc.) can gate on
 * `getConsent() === 'accepted'`.
 *
 * Stored in localStorage so it persists across reloads but stays
 * client-side (no cookie of its own to track).
 */

export type ConsentState = "accepted" | "rejected" | "unset";

const KEY = "mt-cookie-consent";

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  const v = window.localStorage.getItem(KEY);
  if (v === "accepted" || v === "rejected") return v;
  return "unset";
}

export function setConsent(next: "accepted" | "rejected"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, next);
  window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: next }));
}
