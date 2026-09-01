import { test, expect } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const base = `/org/${seed.primaryOrgSlug}/projects/${seed.primaryProjectSlug}/code-report`;

const readOnlyRoutes = [
  `${base}/dashboard`,
  `${base}/history`,
  `${base}/security-policy`,
  `${base}/services`,
  `${base}/services/${seed.seededServiceSlug}`,
  `${base}/settings`,
  `${base}/settings/tools`,
];

test.describe('code report — no codereport:*:read grant at all', () => {
  test('a project:project:read-only role is denied every sub-page', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectReadOnly');
    for (const route of readOnlyRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('code report — project viewer (read, no create/update)', () => {
  test('sees every sub-page', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    for (const route of readOnlyRoutes) {
      await expectAllowed(page, route);
    }
  });

  test('the "add service" button is hidden on the services list', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    await page.goto(`${base}/services`);
    await expect(page.getByRole('button', { name: 'Añadir servicio' })).toHaveCount(0);
  });

  test('the delete button is hidden on the service detail page', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    await page.goto(`${base}/services/${seed.seededServiceSlug}`);
    await expect(page.getByRole('button', { name: 'Borrar servicio' })).toHaveCount(0);
  });
});

test.describe('code report — project developer (has create, not delete)', () => {
  test('the "add service" button is visible on the services list', async ({ page, loginAs }) => {
    await loginAs('projectDeveloper');
    await page.goto(`${base}/services`);
    await expect(page.getByRole('button', { name: 'Añadir servicio' })).toBeVisible();
  });

  // PROJECT_DEVELOPER_PERMISSIONS grants codereport:reports:create/update but not :delete —
  // developer stays read+create/update, only admin gets delete.
  test('the delete button is still hidden on the service detail page', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectDeveloper');
    await page.goto(`${base}/services/${seed.seededServiceSlug}`);
    await expect(page.getByRole('button', { name: 'Borrar servicio' })).toHaveCount(0);
  });
});

test.describe('code report — project admin (has delete)', () => {
  test('the delete button is visible on the service detail page', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/services/${seed.seededServiceSlug}`);
    await expect(page.getByRole('button', { name: 'Borrar servicio' })).toBeVisible();
  });
});

test.describe('code report — services create, real mutation', () => {
  test('project developer can create a service via POST', async ({ page, loginAs }) => {
    await loginAs('projectDeveloper');
    const response = await page.request.post(`${base}/services?/create`, {
      form: { name: 'E2E Mutation Service', slug: 'e2e-mutation-service', tags: '' },
    });
    const body = await response.json();
    expect(body.type).not.toBe('failure');

    await page.goto(`${base}/services`);
    await expect(page.getByText('E2E Mutation Service')).toBeVisible();
  });

  test('project viewer gets a 403 on the same POST', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    const response = await page.request.post(`${base}/services?/create`, {
      form: { name: 'Should Not Be Created', slug: 'should-not-be-created-service', tags: '' },
    });
    const body = await response.json();
    expect(body.type).toBe('failure');
    expect(body.status).toBe(403);
  });
});
