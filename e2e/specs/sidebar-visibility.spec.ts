import { test, expect } from '../fixtures/auth';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const org = seed.primaryOrgSlug;
const project = seed.primaryProjectSlug;

test('org developer only has a sidebar link into "Proyectos", nothing else', async ({
  page,
  loginAs,
}) => {
  await loginAs('orgDeveloper');
  await page.goto(`/org/${org}/projects`);
  const sidebar = page.locator('aside').first();
  await expect(sidebar.locator(`a[href="/org/${org}/projects"]`)).toBeVisible();
  await expect(sidebar.locator(`a[href="/org/${org}/settings/global"]`)).toHaveCount(0);
  await expect(sidebar.locator(`a[href="/org/${org}/settings/access-control"]`)).toHaveCount(0);
  await expect(sidebar.locator(`a[href="/org/${org}/settings/audit"]`)).toHaveCount(0);
});

test('organization settings live in the organization switcher, not in the sidebar', async ({
  page,
  loginAs,
}) => {
  await loginAs('orgAdmin');
  await page.goto(`/org/${org}/projects`);
  // the switcher only opens once the page is hydrated
  await page.waitForLoadState('networkidle');
  const sidebar = page.locator('aside').first();
  await expect(sidebar.locator(`a[href^="/org/${org}/settings/"]`)).toHaveCount(0);

  await sidebar.getByRole('button', { name: /Organización actual/ }).click();
  const settings = page
    .getByRole('dialog')
    .getByRole('link', { name: 'Ajustes de la organización' });
  await expect(settings).toHaveAttribute('href', `/org/${org}/settings/global`);
  await settings.click();
  await expect(page).toHaveURL(new RegExp(`/org/${org}/settings/global`));
});

test('the organization switcher hides the settings link from members without settings access', async ({
  page,
  loginAs,
}) => {
  await loginAs('orgDeveloper');
  await page.goto(`/org/${org}/projects`);
  await page.waitForLoadState('networkidle');
  await page
    .locator('aside')
    .first()
    .getByRole('button', { name: /Organización actual/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Ver todas' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Ajustes de la organización' })).toHaveCount(0);
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
  // Code Report has multiple sub-items, so it renders as a collapsible group (button, not a
  // direct link) — its label being present is enough to prove the module itself is visible.
  await expect(sidebar.getByText('Code Report', { exact: true })).toBeVisible();
  // Vault and State IaC are "coming soon": the service forces both modules off, so they never
  // reach the sidebar regardless of permissions.
  await expect(sidebar.locator(`a[href="${base}/vault"]`)).toHaveCount(0);
  await expect(sidebar.locator(`a[href^="${base}/state-iac"]`)).toHaveCount(0);
});
