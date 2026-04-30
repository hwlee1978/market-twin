import { test, expect } from "@playwright/test";

/**
 * Public-page smoke. Every unauthenticated entry point should render
 * without server errors and contain landmark copy.
 *
 * URL shape: next-intl is configured with localePrefix: "as-needed"
 * (see src/i18n/routing.ts), so the default locale (ko) URLs are
 * UN-prefixed (/login, not /ko/login). Only the non-default locale
 * gets a prefix (/en/login).
 */

test.describe("public pages render", () => {
  test("/login shows the login form with email + password", async ({ page }) => {
    await page.goto("/login");
    // Use text selector instead of role — the form CTA button "로그인하기"
    // and the h2 heading "로그인" both appear, and the role-based locator
    // can be flaky around hydration. A plain text match scoped to the
    // form heading is enough.
    await expect(page.locator("h2", { hasText: "로그인" })).toBeVisible();
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인하기" })).toBeVisible();
  });

  test("/signup renders something (form or coming-soon, depending on flag)", async ({ page }) => {
    // Signup is gated by NEXT_PUBLIC_SIGNUP_ENABLED — in most environments
    // including dev/preview the coming-soon screen is shown instead of the
    // real form. Just assert the page rendered without a server error;
    // form-specific assertions live in auth.spec.ts behind a flag check.
    const res = await page.goto("/signup");
    expect(res?.status()).toBeLessThan(500);
  });

  test("/privacy renders the privacy policy", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1", { hasText: "개인정보 처리방침" })).toBeVisible();
  });

  test("/terms renders the terms of service", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h1", { hasText: "이용약관" })).toBeVisible();
  });

  test("/en/login renders English copy", async ({ page }) => {
    await page.goto("/en/login");
    // Stable selectors: the email/password input labels resolve to English
    // strings under the en locale even though the exact heading copy may
    // shift over time.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });
});

test.describe("root redirect", () => {
  test("anonymous visit to / lands on a public auth page", async ({ page }) => {
    await page.goto("/");
    // Middleware bounces anon users to /login (default locale, no prefix)
    // or /en/login depending on Accept-Language.
    await expect(page).toHaveURL(/\/(en\/)?(login|signup)/);
  });
});

test.describe("cookie consent banner", () => {
  test("banner appears on first visit and dismisses on Accept", async ({ page }) => {
    await page.goto("/login");
    const accept = page.getByRole("button", { name: "모두 허용" });
    await expect(accept).toBeVisible();
    await accept.click();
    // After accepting, the banner unmounts — accept button gone.
    await expect(accept).toBeHidden();
    // Reloading should not show it again (localStorage persists choice).
    await page.reload();
    await expect(accept).toBeHidden();
  });

  test("Reject also dismisses and persists", async ({ page }) => {
    await page.goto("/login");
    const reject = page.getByRole("button", { name: "필수만 허용" });
    await reject.click();
    await page.reload();
    await expect(reject).toBeHidden();
  });
});
