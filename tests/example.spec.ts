import { test, expect } from '@playwright/test';

test('landing page is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
});

test('login page renders form fields', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: /log in|iniciar/i })
    .first()
    .click();
  await expect(page.getByRole('textbox').first()).toBeVisible();
});
