import { test, expect, getSeed } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { E2E_BASE_URL } from '../global-setup';

const seed = getSeed();
const pageUrl = `/org/${seed.primaryOrgSlug}/settings/state-iac`;
const api = `${E2E_BASE_URL}/api/state-iac/backends`;

const backendBody = (name: string) => ({
  organizationId: seed.primaryOrgId,
  name,
  provider: 's3',
  bucket: 'e2e-state',
  endpoint: 'https://minio.example.com',
  auth: 'credentials',
  credentials: { accessKeyId: 'AKIAE2E', secretAccessKey: 'e2e-very-secret' },
});

test.describe.configure({ mode: 'serial' });

test.describe('state iac backends — org admin', () => {
  test('creates a backend from the modal and deletes it typing its name', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgAdmin');
    await expectAllowed(page, pageUrl);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Nuevo backend' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo backend' });
    await modal.getByLabel('Nombre').fill('e2e-gcs');
    await modal.getByLabel('Bucket').fill('e2e-pulumi-state');
    await modal.getByLabel('Prefijo').fill('infra');
    await modal.getByRole('button', { name: 'Nuevo backend' }).click();

    const card = page.getByTestId('state-backends').locator('li', { hasText: 'e2e-gcs' });
    await expect(card).toBeVisible();
    await expect(card.getByText('gs://e2e-pulumi-state/infra')).toBeVisible();

    await card.getByRole('button', { name: 'Eliminar: e2e-gcs' }).click();
    const confirm = page.getByRole('alertdialog', { name: '¿Eliminar backend?' });
    const submit = confirm.getByRole('button', { name: 'Eliminar' });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel('Escribe e2e-gcs para confirmar').fill('e2e-gcs');
    await submit.click();
    await expect(page.getByTestId('state-backends-empty')).toBeVisible();
  });

  test('the API never returns the credentials', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    const created = await page.request.post(api, { data: backendBody('e2e-s3') });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const listed = await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`);
    const text = await listed.text();
    expect(text).toContain('"hasCredentials":true');
    expect(text).not.toContain('e2e-very-secret');
    expect(text).not.toContain('AKIAE2E');
    expect((await page.request.delete(`${api}/${id}`)).status()).toBe(200);
  });
});

test.describe('state iac backends — read only', () => {
  test('organization:stateiac:backends:read sees the page but cannot configure', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgStateIacReader');
    await expectAllowed(page, pageUrl);
    await expect(page.getByRole('heading', { name: 'State IaC', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo backend' })).toHaveCount(0);

    expect((await page.request.post(api, { data: backendBody('nope') })).status()).toBe(403);
    expect((await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`)).status()).toBe(
      200,
    );
  });
});

test.describe('state iac backends — no stateiac grant', () => {
  test('an org developer is denied the page and the API', async ({ page, loginAs }) => {
    await loginAs('orgDeveloper');
    await expectDenied(page, pageUrl);
    expect((await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`)).status()).toBe(
      403,
    );
    expect((await page.request.post(api, { data: backendBody('nope') })).status()).toBe(403);
  });

  test('a member of another organization is denied', async ({ page, loginAs }) => {
    await loginAs('orgOutsider');
    expect((await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`)).status()).toBe(
      403,
    );
  });
});
