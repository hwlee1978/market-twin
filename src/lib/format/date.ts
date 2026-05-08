/**
 * Shared date / datetime formatters. Pulls all date display through one
 * place so the report doesn't render "2026. 5. 8." in one section,
 * "May 8, 2026" in another, and "2026년 5월 8일" in a third — three
 * different views of the same value.
 *
 * Conventions:
 *   - locale "ko" → Korean form ("2026년 5월 8일", "오후 3:24")
 *   - any other → English form ("May 8, 2026", "3:24 PM")
 *   - null / invalid input → null (caller decides whether to show "—")
 */

export function formatDate(
  iso: string | Date | null | undefined,
  isKo: boolean,
): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(isKo ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Date + time formatter — used in admin tables, sim-completion stamps,
 * and the PDF appendix. Produces "2026년 5월 8일 오후 3:24" / "May 8,
 * 2026, 3:24 PM" so the time bit reads naturally in both locales.
 */
export function formatDateTime(
  iso: string | Date | null | undefined,
  isKo: boolean,
): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(isKo ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
