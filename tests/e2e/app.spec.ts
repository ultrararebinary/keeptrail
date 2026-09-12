import { expect, test } from '@playwright/test';

test.describe('Keeptrail desktop shell', () => {
  test('searches, opens evidence, explores, and exposes settings', async ({ page }) => {
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
    await expect(page.getByLabel('Gemini API key')).toHaveAttribute('type', 'password');
  });
});
