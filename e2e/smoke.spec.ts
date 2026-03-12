import { expect, test } from '@playwright/test';

test('health check returns 200', async ({ request }) => {
  const response = await request.get('http://localhost:4001/health');
  expect(response.status()).toBe(200);
});

test('app loads without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test('unauthenticated users are redirected to Clerk login', async ({ page }) => {
  await page.goto('/portfolio');

  await expect
    .poll(async () => {
      const url = page.url().toLowerCase();
      const signInHeading = page.getByRole('heading', { name: /sign in/i }).first();
      const hasSignInHeading = await signInHeading.isVisible().catch(() => false);

      return url.includes('sign-in') || hasSignInHeading;
    })
    .toBe(true);
});
