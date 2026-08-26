/**
 * Minimal relative-time formatter ("2일 전" / "2 days ago") for the
 * dashboard's recent-project cards. No date library is installed
 * (checked package.json) so this is a small dependency-free helper
 * scoped to the dashboard rather than pulling in date-fns for one use.
 */
export function formatRelativeTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const isKo = locale === "ko";
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return isKo ? "방금 전" : "just now";
  if (diffMin < 60) return isKo ? `${diffMin}분 전` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isKo ? `${diffHr}시간 전` : `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return isKo ? `${diffDay}일 전` : `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return isKo ? `${diffMonth}개월 전` : `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return isKo ? `${diffYear}년 전` : `${diffYear}y ago`;
}
