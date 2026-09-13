import { expect, test, type Page } from '@playwright/test';

const desktopViewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }] as const;

async function exerciseDesktopShell(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await expect(page.getByRole('button', { name: /A calmer way to choose type/ })).toBeVisible();

  await page.getByRole('button', { name: /A calmer way to choose type/ }).click();
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.getByText('Typewolf', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections with a reason.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Explore connections map' })).toBeVisible();

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Provider health' })).toBeVisible();
  await expect(page.getByLabel('AI provider')).toHaveValue('mistral');
  await expect(page.getByLabel('Mistral Free API key')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('option', { name: 'OpenRouter Free' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Mistral Free' })).toHaveCount(1);
}

for (const viewport of desktopViewports) {
  test.describe(`Keeptrail desktop shell at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('searches, opens evidence, explores, and exposes settings', async ({ page }) => {
      await exerciseDesktopShell(page);
    });
  });
}
