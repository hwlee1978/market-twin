/**
 * Translates raw Supabase auth error messages into user-friendly
 * locale-aware copy. Supabase returns messages in English regardless
 * of locale, so we map known patterns to i18n keys at the call site.
 *
 * The function returns an i18n KEY string (not the translated text)
 * so the caller can call useTranslations()(...) to render. This keeps
 * the i18n system as the single source of truth for copy.
 */

const PATTERNS: Array<{ test: (msg: string) => boolean; key: string }> = [
  {
    test: (m) => /invalid login credentials/i.test(m),
    key: "errors.auth.invalidCredentials",
  },
  {
    test: (m) => /email not confirmed/i.test(m),
    key: "errors.auth.emailNotConfirmed",
  },
  {
    test: (m) => /user already registered/i.test(m) || /already (been )?registered/i.test(m),
    key: "errors.auth.alreadyRegistered",
  },
  {
    test: (m) => /password should be at least/i.test(m) || /weak password/i.test(m),
    key: "errors.auth.weakPassword",
  },
  {
    test: (m) => /unable to validate email/i.test(m) || /invalid email/i.test(m),
    key: "errors.auth.invalidEmail",
  },
  {
    test: (m) => /for security purposes/i.test(m) || /rate limit/i.test(m),
    key: "errors.auth.rateLimit",
  },
  {
    test: (m) => /captcha/i.test(m),
    key: "errors.auth.captcha",
  },
  {
    test: (m) => /signups (are )?(not allowed|disabled)/i.test(m),
    key: "errors.auth.signupDisabled",
  },
];

export function authErrorKey(rawMessage: string): string {
  for (const p of PATTERNS) {
    if (p.test(rawMessage)) return p.key;
  }
  return "errors.auth.generic";
}
