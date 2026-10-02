"use client";

import { useSyncExternalStore } from "react";

/**
 * A timestamp in the reader's own timezone.
 *
 * Server components calling `toLocaleString()` format in the server's
 * zone, which on Vercel is UTC. A Korean customer looking at a run that
 * finished at 00:05 KST saw "10/2/2026, 3:05:19 PM" — nine hours earlier
 * and on the wrong day. The server has no way to know the viewer's
 * zone, so the browser has to do it.
 *
 * Renders a deterministic UTC string first, identical on both sides so
 * hydration matches, then swaps to the viewer's zone once mounted. The
 * `dateTime` attribute always carries the unambiguous instant.
 */
export function LocalTime({
  iso,
  locale,
  mode = "datetime",
  fallback = "—",
}: {
  iso: string | null | undefined;
  /** BCP-47 tag; defaults to the browser's own preference. */
  locale?: string;
  mode?: "datetime" | "date";
  /** Shown when there is no timestamp at all. */
  fallback?: string;
}) {
  const format = (tz?: string) => {
    if (!iso) return fallback;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    const opts: Intl.DateTimeFormatOptions =
      mode === "date"
        ? { year: "numeric", month: "short", day: "numeric" }
        : {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          };
    return d.toLocaleString(locale, tz ? { ...opts, timeZone: tz } : opts);
  };

  // The server snapshot is UTC and the client snapshot is the viewer's
  // zone, which is exactly what useSyncExternalStore is for: React takes
  // the server string for the markup, then the client one on hydration,
  // with no effect writing state and no hydration mismatch. The store
  // never emits, because a timezone does not change mid-session.
  const text = useSyncExternalStore(
    () => () => {},
    () => format(undefined),
    () => format("UTC"),
  );

  if (!iso) return <>{fallback}</>;
  return <time dateTime={iso}>{text}</time>;
}
