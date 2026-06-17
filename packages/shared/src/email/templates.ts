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
    welcomeSubject: "Market Twin 베타 테스트에 오신 것을 환영합니다",
    welcomeHello: "베타 테스트에 참여해주셔서 감사합니다",
    welcomeIntro:
      "Market Twin은 현재 베타 테스트 중입니다. 베타 기간 동안 7일 또는 초기검증 2회까지 모든 기능을 무료로 사용하실 수 있습니다. 신용카드는 필요 없습니다.",
    welcomeNextSteps: "다음 단계",
    welcomeStep1Title: "첫 프로젝트 생성",
    welcomeStep1Body:
      "제품 이름, 카테고리, 가격, 타겟층을 입력하면 5분 안에 첫 시뮬레이션을 시작할 수 있습니다. 비기술자도 가능합니다.",
    welcomeStep2Title: "초기검증 (Hypothesis)으로 시작",
    welcomeStep2Body:
      "무료 체험 시뮬은 \"초기검증\" tier — 600명 AI 페르소나가 3개 시뮬을 멀티 LLM로 돌려 Top-2 후보 시장을 7-10분 안에 알려드립니다.",
    welcomeStep3Title: "결과로 의사결정",
    welcomeStep3Body:
      "PDF 리포트, CSV 내보내기, 공개 공유 링크까지 — 임원진 보고에 그대로 쓸 수 있는 형태로 제공됩니다.",
    welcomeCtaPrimary: "지금 시작하기",
    welcomeCtaSecondary: "방법론 보기",
    welcomeQuestions:
      "베타 기간 중 느낀 점이나 개선 아이디어가 있으시면 언제든 <a href=\"mailto:contact@markettwin.ai\" style=\"color:#0A1F4D;text-decoration:underline\">contact@markettwin.ai</a> 로 보내주세요. 여러분의 피드백을 제품에 적극 반영하겠습니다.",
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
    welcomeSubject: "Welcome to the Market Twin beta",
    welcomeHello: "Thanks for joining the beta",
    welcomeIntro:
      "Market Twin is currently in beta. During the beta you get free access for 7 days or 2 hypothesis simulations — whichever comes first. No credit card required.",
    welcomeNextSteps: "Next steps",
    welcomeStep1Title: "Create your first project",
    welcomeStep1Body:
      "Enter your product name, category, price, and target audience. You can launch your first simulation in under 5 minutes — no technical setup needed.",
    welcomeStep2Title: "Start with Hypothesis tier",
    welcomeStep2Body:
      "Your free simulation runs at the Hypothesis tier: 600 AI personas across 3 multi-LLM sims, returning the Top-2 candidate markets in 7-10 minutes.",
    welcomeStep3Title: "Use the results to decide",
    welcomeStep3Body:
      "PDF report, CSV export, and a public share link — formatted for executive review out of the box.",
    welcomeCtaPrimary: "Get started",
    welcomeCtaSecondary: "Read the methodology",
    welcomeQuestions:
      "Have feedback or ideas during the beta? Email us anytime at <a href=\"mailto:contact@markettwin.ai\" style=\"color:#0A1F4D;text-decoration:underline\">contact@markettwin.ai</a> — we'll fold it straight into the product.",
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

interface WelcomeInput {
  locale: Locale;
  appUrl: string;       // e.g. https://app.markettwin.ai
  marketingUrl: string; // e.g. https://www.markettwin.ai
}

/**
 * One-time welcome email sent right after a user confirms their email
 * (or after first successful session if email confirmation is off).
 * Sets the free-trial expectation, walks through the first 3 steps,
 * and gives both an in-app and methodology CTA so the user picks the
 * path that matches their reading style.
 */
export function renderWelcomeEmail(input: WelcomeInput) {
  const c = COPY[input.locale];
  const subject = c.welcomeSubject;
  const dashboardUrl = `${input.appUrl}/${input.locale}/dashboard`;
  const methodologyUrl =
    input.locale === "ko"
      ? `${input.marketingUrl}/methodology.html`
      : `${input.marketingUrl}/methodology-en.html`;

  const step = (n: number, title: string, body: string) => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:36px;">
        <span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:#0A1F4D;color:#fff;font-size:12px;font-weight:700;text-align:center;">${n}</span>
      </td>
      <td style="padding:14px 16px 14px 0;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:4px;">${escape(title)}</div>
        <div style="font-size:13px;color:#475569;line-height:1.65;">${escape(body)}</div>
      </td>
    </tr>
  `;

  const text = [
    c.welcomeHello,
    "",
    c.welcomeIntro,
    "",
    c.welcomeNextSteps,
    `1. ${c.welcomeStep1Title} — ${c.welcomeStep1Body}`,
    `2. ${c.welcomeStep2Title} — ${c.welcomeStep2Body}`,
    `3. ${c.welcomeStep3Title} — ${c.welcomeStep3Body}`,
    "",
    `${c.welcomeCtaPrimary}: ${dashboardUrl}`,
    `${c.welcomeCtaSecondary}: ${methodologyUrl}`,
  ].join("\n");

  const html = layout(
    `
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#0f172a;letter-spacing:-0.01em;">${escape(c.welcomeHello)}</h1>
    <p style="margin:0 0 22px 0;font-size:14px;line-height:1.7;color:#475569;">
      ${escape(c.welcomeIntro)}
    </p>

    <div style="font-size:11px;font-weight:700;color:#0A1F4D;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
      ${escape(c.welcomeNextSteps)}
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${step(1, c.welcomeStep1Title, c.welcomeStep1Body)}
      ${step(2, c.welcomeStep2Title, c.welcomeStep2Body)}
      ${step(3, c.welcomeStep3Title, c.welcomeStep3Body)}
    </table>

    <a href="${dashboardUrl}" style="display:inline-block;background:#0A1F4D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-right:8px;">
      ${escape(c.welcomeCtaPrimary)} →
    </a>
    <a href="${methodologyUrl}" style="display:inline-block;color:#0A1F4D;text-decoration:none;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:500;border:1px solid #e2e8f0;">
      ${escape(c.welcomeCtaSecondary)}
    </a>

    <p style="margin:28px 0 0 0;font-size:13px;line-height:1.65;color:#64748b;">
      ${c.welcomeQuestions}
    </p>
    `,
    c.appName,
    c.footer,
  );
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
  // Inline-SVG logo mark — Gmail and most modern clients render inline SVG
  // fine. The wordmark sits next to it so the brand reads even when image
  // download is blocked (the SVG is part of the HTML payload, not a remote
  // asset).
  const logoSvg = `
    <svg viewBox="0 0 32 32" width="20" height="20" fill="none" style="vertical-align:middle;">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#0A1F4D"/>
      <rect x="11" y="11" width="18" height="18" rx="3" fill="none" stroke="#0A1F4D" stroke-width="2.2"/>
    </svg>
  `;
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
      <td style="padding:20px 32px;border-bottom:1px solid #e2e8f0;">
        <span style="display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:#0A1F4D;letter-spacing:-0.01em;">
          ${logoSvg}
          <span>Market Twin</span>
        </span>
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
