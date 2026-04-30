import { test, expect } from "@playwright/test";

/**
 * Auth form validation — purely client-side. We never actually submit
 * to Supabase here; we just verify the form gates we built in the
 * SignupForm / LoginPage components don't regress. Real auth round-trips
 * belong in a separate integration suite with a seeded test user.
 *
 * Signup tests are gated on PLAYWRIGHT_SIGNUP_ENABLED — set it to "true"
 * locally only when you're running with NEXT_PUBLIC_SIGNUP_ENABLED=true,
 * otherwise /signup serves the coming-soon screen and these would fail.
 */
const SIGNUP_ENABLED = process.env.PLAYWRIGHT_SIGNUP_ENABLED === "true";

test.describe("signup ToS consent gate", () => {
  test.skip(!SIGNUP_ENABLED, "signup form is gated; set PLAYWRIGHT_SIGNUP_ENABLED=true to run");
  test("submit is disabled until the required terms checkbox is checked", async ({ page }) => {
    await page.goto("/signup");

    const submit = page.getByRole("button", { name: "무료 체험 시작" });
    await page.getByLabel("이메일").fill("test@example.com");
    await page.getByLabel("비밀번호").fill("password1234");

    // ToS not yet checked → button must remain disabled. This is the
    // legal compliance gate; if it ever flips to enabled here, we've
    // shipped a broken consent flow.
    await expect(submit).toBeDisabled();

    // Checking the FIRST (required ToS) checkbox should enable submit.
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.first().check();
    await expect(submit).toBeEnabled();
  });

  test("marketing checkbox alone does not satisfy the gate", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("이메일").fill("test@example.com");
    await page.getByLabel("비밀번호").fill("password1234");

    const checkboxes = page.getByRole("checkbox");
    // Check only the optional marketing box (second one).
    await checkboxes.nth(1).check();
    await expect(page.getByRole("button", { name: "무료 체험 시작" })).toBeDisabled();
  });
});

test.describe("login form basics", () => {
  test("email and password fields are required (browser-native validation)", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "로그인하기" });
    // Click without filling — required attribute should block submit and
    // keep us on the same page rather than firing the request.
    await submit.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
