import { test, expect } from '@playwright/test';
import { E2E_PASSWORD } from '../fixtures/seed';
import { getSeed } from '../fixtures/auth';

async function gotoLogin(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
}

test('logs in through the real form and reaches the app shell', async ({ page }) => {
  const seed = getSeed();
  await gotoLogin(page);
  await page.getByLabel('Correo electrónico').fill('cluster-admin@e2e.test');
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  expect(seed.primaryOrgSlug).toBe('e2e-primary');
});

test('rejects a wrong password', async ({ page }) => {
  await gotoLogin(page);
  await page.getByLabel('Correo electrónico').fill('cluster-admin@e2e.test');
  await page.getByLabel('Contraseña').fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});
