import { test, expect } from '@playwright/test';

/**
 * Project Copilot E2E happy-path.
 *
 * These tests require:
 * - baseURL and webServer in playwright.config.ts (e.g. http://localhost:3000)
 * - Authenticated session (storageState or login fixture)
 * - At least one project with Copilot module enabled
 *
 * Unskip and replace PROJECT_ID when E2E infra is in place. See Phase 7 in the blueprint.
 */
test.describe('Project Copilot', () => {
  test.skip('opens Copilot tab and shows session UI', async ({ page }) => {
    await page.goto('/context/PROJECT_ID/copilot');
    await expect(
      page.getByRole('combobox', { name: /session|sesión/i })
    ).toBeVisible();
  });

  test.skip('shows empty state when session has no messages', async ({
    page,
  }) => {
    await page.goto('/context/PROJECT_ID/copilot');
    await expect(
      page.getByText(/project assistant|asistente de proyecto/i)
    ).toBeVisible();
  });
});
