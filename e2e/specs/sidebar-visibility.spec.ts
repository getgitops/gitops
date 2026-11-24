import { test, expect } from '../fixtures/auth';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const org = seed.primaryOrgSlug;
const project = seed.primaryProjectSlug;

test('org developer only has a link into "Proyectos", nothing else', async ({
  page,
  loginAs,
}) => {
  await loginAs('orgDeveloper');
  await page.goto(`/org/${org}/settings/projects`);
  const sidebar = page.locator('aside').first();
  await expect(sidebar.locator(`a[href="/org/${org}/settings/projects"]`)).toBeVisible();
  await expect(sidebar.locator(`a[href="/org/${org}/settings/global"]`)).toHaveCount(0);
  await expect(sidebar.locator(`a[href="/org/${org}/settings/access-control"]`)).toHaveCount(0);
  await expect(sidebar.locator(`a[href="/org/${org}/settings/audit"]`)).toHaveCount(0);
  // con un solo recurso no hay pestañas de sección
  await expect(page.locator('#section-nav')).toHaveCount(0);
});

test('org admin has links into every organization settings resource', async ({
  page,
  loginAs,
}) => {
  await loginAs('orgAdmin');
  await page.goto(`/org/${org}/settings/projects`);
  // el sidebar enlaza el módulo; cada recurso está en las pestañas de sección
  const sectionNav = page.locator('#section-nav');
  for (const path of [
    'projects',
    'global',
    'access-control',
    'roles-permissions',
    'system-backup',
    'server-access-keys',
    'audit',
  ]) {
    await expect(sectionNav.locator(`a[href="/org/${org}/settings/${path}"]`)).toBeVisible();
  }
});

test('a read-only project role has no sidebar link into Vault, Code Report or State IaC', async ({
  page,
  loginAs,
}) => {
  await loginAs('projectReadOnly');
  await page.goto(`/org/${org}/projects/${project}/settings/overview`);
  const sidebar = page.locator('aside').first();
  const base = `/org/${org}/projects/${project}`;
  await expect(sidebar.locator(`a[href="${base}/vault"]`)).toHaveCount(0);
  await expect(sidebar.getByText('Code Report', { exact: true })).toHaveCount(0);
  await expect(sidebar.locator(`a[href^="${base}/state-iac"]`)).toHaveCount(0);
});

test('project admin has a sidebar link into Code Report', async ({ page, loginAs }) => {
  await loginAs('projectAdmin');
  await page.goto(`/org/${org}/projects/${project}/settings/overview`);
  const sidebar = page.locator('aside').first();
  const base = `/org/${org}/projects/${project}`;
  await expect(sidebar.getByText('Code Report', { exact: true })).toBeVisible();
  // Vault is enabled for the seeded project, so the admin gets it too. State IaC is "coming soon":
  // the service forces it off, so it never reaches the sidebar regardless of permissions.
  await expect(sidebar.locator(`a[href="${base}/vault"]`)).toBeVisible();
  await expect(sidebar.locator(`a[href^="${base}/state-iac"]`)).toHaveCount(0);
});
