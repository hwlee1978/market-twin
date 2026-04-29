/**
 * Email templates kept inline (no JSX/React Email) so the bundle stays
 * lean and we don't need a separate render path. Each template returns
 * { subject, html, text } which the Resend SDK consumes directly.
 *
 * Locale-aware: the runner passes the user's locale through and we pick
 * Korean or English copy. Subject lines stay short for mobile preview.
 */

export type Locale = "ko" | "en";

interface CompleteInput {
  locale: Locale;
  productName: string;
  successScore: number | null;
  bestCountry: string | null;
  bestCountryLabel: string | null;
  recommendedPriceUsd: number | null;
  resultsUrl: string;
}

interface FailedInput {
  locale: Locale;
  productName: string;
  errorMessage: string;
  retryUrl: string;
}

const COPY = {
  ko: {
    appName: "AI Market Twin",
    completeSubject: (p: string) => `[AI Market Twin] ${p} 시뮬레이션이 완료됐습니다`,
    completeHello: "시뮬레이션이 완료됐습니다",
    completeIntro: (p: string) =>
      `방금 실행한 <strong>${p}</strong> 의 시장 반응 시뮬레이션 결과가 준비됐습니다.`,
    completeCtaLabel: "결과 보기",
    metricSuccess: "성공 점수",
    metricBestCountry: "추천 국가",
    metricRecommendedPrice: "추천 가격",
    failedSubject: (p: string) => `[AI Market Twin] ${p} 시뮬레이션이 실패했습니다`,
    failedHello: "시뮬레이션 실행 중 오류",
    failedIntro: (p: string) =>
      `<strong>${p}</strong> 시뮬레이션이 완료되지 못했습니다. 아래 메시지를 확인하시고 재시도해주세요.`,
    failedCtaLabel: "프로젝트로 가서 재시도",
    footer: "이 메일은 워크스페이스 활동 알림입니다.",
  },
  en: {
    appName: "AI Market Twin",
    completeSubject: (p: string) => `[AI Market Twin] ${p} simulation is ready`,
    completeHello: "Your simulation is ready",
    completeIntro: (p: string) =>
      `Your market reaction simulation for <strong>${p}</strong> just finished. Take a look at the highlights below.`,
    completeCtaLabel: "View results",
    metricSuccess: "Success score",
    metricBestCountry: "Best country",
    metricRecommendedPrice: "Recommended price",
    failedSubject: (p: string) => `[AI Market Twin] ${p} simulation failed`,
    failedHello: "Simulation failed",
    failedIntro: (p: string) =>
      `Your <strong>${p}</strong> simulation didn't finish. The error is shown below — head back to the project to retry.`,
    failedCtaLabel: "Retry from project",
    footer: "This email is a workspace activity notification.",
  },
} as const;

export function renderCompleteEmail(input: CompleteInput) {
  const c = COPY[input.locale];
  const subject = c.completeSubject(input.productName);
  const text = [
    c.completeHello,
    "",
    c.completeIntro(input.productName).replace(/<[^>]+>/g, ""),
    "",
    input.successScore !== null ? `${c.metricSuccess}: ${input.successScore}/100` : null,
    input.bestCountryLabel
      ? `${c.metricBestCountry}: ${input.bestCountryLabel}`
      : null,
    input.recommendedPriceUsd !== null
      ? `${c.metricRecommendedPrice}: $${input.recommendedPriceUsd.toFixed(2)}`
      : null,
    "",
    `${c.completeCtaLabel}: ${input.resultsUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = layout(`
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#0f172a;">${escape(c.completeHello)}</h1>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.7;color:#475569;">
      ${c.completeIntro(escape(input.productName))}
    </p>
    ${metricsBlock(c, input)}
    <a href="${input.resultsUrl}" style="display:inline-block;margin-top:24px;background:#0b2a5b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      ${escape(c.completeCtaLabel)} →
    </a>
  `, c.appName, c.footer);
  return { subject, html, text };
}

export function renderFailedEmail(input: FailedInput) {
  const c = COPY[input.locale];
  const subject = c.failedSubject(input.productName);
  const text = [
    c.failedHello,
    "",
    c.failedIntro(input.productName).replace(/<[^>]+>/g, ""),
    "",
    input.errorMessage,
    "",
    `${c.failedCtaLabel}: ${input.retryUrl}`,
  ].join("\n");
  const html = layout(`
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#0f172a;">${escape(c.failedHello)}</h1>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:#475569;">
      ${c.failedIntro(escape(input.productName))}
    </p>
    <pre style="margin:0 0 24px 0;padding:12px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b;white-space:pre-wrap;font-family:ui-monospace,'SF Mono',monospace;">${escape(input.errorMessage)}</pre>
    <a href="${input.retryUrl}" style="display:inline-block;background:#0b2a5b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      ${escape(c.failedCtaLabel)} →
    </a>
  `, c.appName, c.footer);
  return { subject, html, text };
}

function metricsBlock(
  c: typeof COPY[Locale],
  input: CompleteInput,
): string {
  const rows = [
    input.successScore !== null
      ? row(c.metricSuccess, `${input.successScore} / 100`)
      : "",
    input.bestCountryLabel ? row(c.metricBestCountry, input.bestCountryLabel) : "",
    input.recommendedPriceUsd !== null
      ? row(c.metricRecommendedPrice, `$${input.recommendedPriceUsd.toFixed(2)}`)
      : "",
  ]
    .filter(Boolean)
    .join("");
  if (!rows) return "";
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      ${rows}
    </table>
  `;
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:12px 14px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #f1f5f9;">${escape(label)}</td>
      <td style="padding:12px 14px;font-size:14px;color:#0f172a;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${escape(value)}</td>
    </tr>
  `;
}

function layout(content: string, appName: string, footerText: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escape(appName)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0f172a;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:13px;font-weight:600;color:#0b2a5b;letter-spacing:0.02em;">${escape(appName)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5;">
        ${escape(footerText)}
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
