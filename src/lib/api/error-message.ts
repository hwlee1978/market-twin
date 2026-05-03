/**
 * Turn an HTTP error response into a sentence the user can act on.
 *
 * Most callers were doing `throw new Error(await res.text())` and dumping
 * raw JSON or "Internal Server Error" at the user. This helper:
 *  - Extracts the human-readable message from common server payload shapes
 *    ({error: "..."}, Zod fieldErrors, raw text)
 *  - Maps common HTTP status codes to localised, action-oriented copy
 *  - Caps message length so a server stack trace doesn't fill the toast
 *
 * Pure function — accepts a Response (already not-ok) and returns a string.
 * Doesn't throw.
 */

const MAX_RAW_LEN = 200;

export async function friendlyApiError(
  res: Response,
  locale: "ko" | "en" = "ko",
): Promise<string> {
  const isKo = locale === "ko";

  // ── status-based defaults ────────────────────────────────────────
  const statusCopy = (() => {
    if (res.status === 401) {
      return isKo ? "로그인이 필요합니다." : "Please sign in.";
    }
    if (res.status === 403) {
      return isKo
        ? "이 작업에 권한이 없습니다."
        : "You don't have permission for this action.";
    }
    if (res.status === 404) {
      return isKo ? "요청한 리소스를 찾을 수 없습니다." : "Not found.";
    }
    if (res.status === 409) {
      return isKo
        ? "아직 처리할 준비가 되지 않았습니다. 잠시 후 다시 시도하세요."
        : "Not ready yet — try again in a moment.";
    }
    if (res.status === 429) {
      return isKo
        ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
        : "Rate-limited — please try again shortly.";
    }
    if (res.status >= 500) {
      return isKo
        ? "서버 오류가 발생했습니다. 문제가 계속되면 지원팀에 문의하세요."
        : "Server error. If this persists, please contact support.";
    }
    return null;
  })();

  // ── try to extract a more specific message from the body ─────────
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    return statusCopy ?? (isKo ? "알 수 없는 오류" : "Unknown error");
  }

  const detail = parseDetail(raw);
  if (detail && statusCopy) {
    // Status copy as the headline, server detail as the parenthetical.
    return `${statusCopy} (${truncate(detail)})`;
  }
  if (detail) return truncate(detail);
  if (statusCopy) return statusCopy;
  return truncate(raw) || (isKo ? "알 수 없는 오류" : "Unknown error");
}

function parseDetail(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
    // Zod-ish: { error: { fieldErrors: { field: [msg] }, formErrors: [...] } }
    const fieldErrors = parsed?.error?.fieldErrors ?? parsed?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      const lines = Object.entries(fieldErrors as Record<string, string[]>)
        .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
        .filter(Boolean);
      if (lines.length > 0) return lines.join(" · ");
    }
    const formErrors = parsed?.error?.formErrors ?? parsed?.formErrors;
    if (Array.isArray(formErrors) && formErrors.length > 0) {
      return formErrors.join(", ");
    }
    return null;
  } catch {
    // Not JSON — fall back to the raw text. Strip any HTML so a server
    // error page doesn't render markup inside our toast.
    const stripped = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped || null;
  }
}

function truncate(s: string): string {
  if (s.length <= MAX_RAW_LEN) return s;
  return s.slice(0, MAX_RAW_LEN - 3) + "...";
}

/**
 * Same shape but for client-side errors (fetch threw, JS exception).
 * Use in .catch handlers when you want a localised default rather than
 * surfacing "TypeError: Failed to fetch" etc.
 */
export function friendlyClientError(
  err: unknown,
  locale: "ko" | "en" = "ko",
): string {
  const isKo = locale === "ko";
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return isKo
      ? "네트워크 연결을 확인하세요."
      : "Please check your network connection.";
  }
  if (err instanceof Error) return truncate(err.message);
  return isKo ? "알 수 없는 오류" : "Unknown error";
}
