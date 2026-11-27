import { test, expect, getSeed } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { E2E_BASE_URL } from '../global-setup';

// one bucket (the fake S3 over test/fixtures/state-iac/project-layout), two projects of the same
// organization: acme-infra → primary project, acme-platform → secondary project
const seed = getSeed();
const org = seed.primaryOrgSlug;
const projectA = `/org/${org}/projects/${seed.primaryProjectSlug}/state-iac`;
const projectB = `/org/${org}/projects/${seed.secondaryProjectSlug}/state-iac`;
const backend = seed.stateBackendId;
const api = `${E2E_BASE_URL}/api/state-iac/stacks`;
const prod = `${projectA}?stack=${backend}/acme-infra/prod`;
const tabsLabel = 'Contenido del stack';

test.describe('state iac stacks — project view', () => {
  test('a user of project A sees its stacks and not those of project B in the same bucket', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, projectA);
    const strip = page.getByTestId('environments');
    await expect(strip.locator('[data-stack="acme-infra/prod"]')).toBeVisible();
    await expect(strip.locator('[data-stack="acme-infra/staging"]')).toBeVisible();
    await expect(strip.locator('[data-stack="acme-platform/dev"]')).toHaveCount(0);
    // the most recently updated stack is selected, and the lock fixture shows on prod
    await expect(page.getByTestId('backend-chip')).toContainText('e2e-shared-state');
    await expect(page.getByTestId('stack-toolbar').getByText('En curso')).toBeVisible();

    // B's stack through A's project (old path and ?stack=), and B's project itself
    const response = await page.goto(`${projectA}/${backend}/acme-platform/dev`);
    expect(response?.status()).toBe(404);
    const viaQuery = await page.goto(`${projectA}?stack=${backend}/acme-platform/dev`);
    expect(viaQuery?.status()).toBe(404);
    await expectDenied(page, projectB);
  });

  test('the old stack path redirects to the dashboard', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${projectA}/${backend}/acme-infra/staging`);
    await expect(page).toHaveURL(
      /state-iac\?stack=.*acme-infra%2Fstaging|state-iac\?stack=.*staging/,
    );
    await expect(page.getByTestId('stack-dashboard')).toBeVisible();
  });

  test('the dashboard summarizes health, resources and deployments of prod', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, prod);
    await page.waitForLoadState('networkidle');
    const dashboard = page.getByTestId('stack-dashboard');
    await expect(dashboard.getByTestId('kpi-health')).toContainText('Salud');
    await expect(dashboard.getByTestId('kpi-resources')).toContainText('Recursos');
    await expect(dashboard.getByTestId('kpi-last-deploy')).toContainText('Último despliegue');
    await expect(dashboard.getByTestId('kpi-last-deploy')).toContainText('correcto');
    await expect(dashboard.getByTestId('dashboard-recent')).toContainText('Últimos despliegues');
    await expect(dashboard.getByTestId('dashboard-recent').locator('li')).toHaveCount(4);
    await expect(dashboard.getByTestId('dashboard-deploys')).toBeVisible();
    await expect(dashboard.getByTestId('dashboard-types')).toBeVisible();
    await expect(dashboard.getByTestId('dashboard-changes')).toBeVisible();

    // jumping to the history from the summary
    await dashboard.getByRole('button', { name: /Ver historial/ }).click();
    await expect(page.getByTestId('stack-history')).toBeVisible();
  });

  test('the page streams: skeleton first, then the real dashboard', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    // the document answers as soon as permissions and bindings are decided
    await page.goto(prod, { waitUntil: 'commit' });
    const kpi = page.getByTestId('kpi-health');
    await expect(kpi).toContainText('Salud');
    await expect(page.getByTestId('state-iac-skeleton')).toHaveCount(0);
  });

  test('a stack assigned to the project but missing in the bucket is a not-found state', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    // the binding covers every stack of acme-infra, so the page answers and the stream says it is gone
    const response = await page.goto(`${projectA}?stack=${backend}/acme-infra/ghost`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('stack-not-found')).toBeVisible();
  });

  test('the stack selector switches to staging', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, projectA);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Stack', { exact: true }).click();
    await page.getByRole('option', { name: /acme-infra \/ staging/ }).click();
    await expect(page).toHaveURL(/stack=.*staging/);
    await expect(
      page.getByTestId('environments').locator('[data-stack="acme-infra/staging"]'),
    ).toHaveAttribute('aria-current', 'true');
  });

  test('the stack detail shows the resource tree, masked secrets and outputs', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, prod);
    // interactive only once hydrated
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('tablist', { name: tabsLabel })
      .getByRole('tab', { name: /Recursos/ })
      .click();
    const tree = page.getByTestId('resource-tree');
    await expect(tree.getByRole('button', { name: /acme-infra-prod/ }).first()).toBeVisible();

    // a Cloud SQL user: its password is a secret, never shown
    await page.getByPlaceholder('Buscar recurso por nombre, tipo o ID').fill('user-api');
    await tree.getByRole('button', { name: /cloud-sql-acme-prod-user-api/ }).click();
    const drawer = page.getByRole('dialog', { name: 'cloud-sql-acme-prod-user-api' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('[secret]').first()).toBeVisible();
    await expect(drawer).not.toContainText('ciphertext');
    await page.keyboard.press('Escape');

    await expect(drawer).toBeHidden();
    await page
      .getByRole('tablist', { name: 'Contenido del stack' })
      .getByRole('tab', { name: /Outputs/ })
      .click();
    await expect(page.getByTestId('stack-outputs')).toContainText('acme-assets-prod');
  });

  test('stacks:read alone lists the stacks but does not open their resources', async ({
    page,
    loginAs,
  }) => {
    await loginAs('stateiacStacksOnly');
    await expectAllowed(page, prod);
    await expect(
      page.getByTestId('environments').locator('[data-stack="acme-infra/prod"]'),
    ).toBeVisible();
    // health and last deployment come with the summary; resources and history do not
    const dashboard = page.getByTestId('stack-dashboard');
    await expect(dashboard.getByTestId('kpi-health')).toBeVisible();
    await expect(dashboard.getByTestId('kpi-last-deploy')).toContainText('Último despliegue');
    await expect(dashboard.getByTestId('dashboard-deploys')).toHaveCount(0);
    await expect(dashboard.getByTestId('dashboard-types')).toHaveCount(0);
    await expect(dashboard.getByTestId('dashboard-changes')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Recursos/ })).toHaveCount(0);
    await expect(page.getByTestId('resource-tree')).toHaveCount(0);
  });
});

test.describe('state iac stacks — API scoping', () => {
  test("a project API key only reaches its project's stacks", async ({
    page,
    loginAs,
    request,
  }) => {
    // its own viewer key: other specs revoke seeded keys
    await loginAs('projectAdmin');
    const created = await page.request.post(
      `/org/${org}/projects/${seed.primaryProjectSlug}/settings/server-access-keys?/create`,
      {
        form: { name: 'e2e-stateiac-reader', roleId: seed.projectViewerRoleId, expiresInDays: '' },
      },
    );
    const token = (await created.text()).match(/gvs_[A-Za-z0-9_-]+/)?.[0];
    expect(token, 'expected the created key in the action response').toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };
    const projectStacks = `${api}?projectId=${seed.primaryProjectId}`;
    const listed = await request.get(projectStacks, { headers });
    expect(listed.status()).toBe(200);
    const body = (await listed.json()) as {
      backends: { stacks: { ref: { project: string } }[] }[];
    };
    const projects = body.backends.flatMap((b) => b.stacks.map((s) => s.ref.project));
    expect(projects).toContain('acme-infra');
    expect(projects).not.toContain('acme-platform');

    const other = await request.get(
      `${api}/${backend}/acme-platform/dev?projectId=${seed.primaryProjectId}`,
      { headers },
    );
    expect(other.status()).toBe(404);
    const orgListing = await request.get(`${api}?organizationId=${seed.primaryOrgId}`, { headers });
    expect(orgListing.status()).toBe(403);

    const detail = await request.get(
      `${api}/${backend}/acme-infra/prod?projectId=${seed.primaryProjectId}&include=resources,outputs`,
      { headers },
    );
    const text = await detail.text();
    expect(text).not.toMatch(/ciphertext|secrets_providers/);
  });
});

test.describe('state iac stacks — organization API', () => {
  test('the organization lists every stack through the API, with its assigned project', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgAdmin');
    const response = await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      backends: {
        stacks: { ref: { project: string; stack: string }; assignedProjectId: string | null }[];
      }[];
    };
    const stacks = body.backends.flatMap((b) => b.stacks);
    const names = stacks.map((s) => `${s.ref.project}/${s.ref.stack}`);
    expect(names).toEqual(
      expect.arrayContaining(['acme-infra/prod', 'acme-infra/staging', 'acme-platform/dev']),
    );
    expect(stacks.find((s) => s.ref.stack === 'prod')?.assignedProjectId).toBe(
      seed.primaryProjectId,
    );
    const platform = stacks.find((s) => s.ref.stack === 'dev')?.assignedProjectId;
    expect(platform).toBeTruthy();
    expect(platform).not.toBe(seed.primaryProjectId);
  });

  test('without organization:stateiac:stacks:read the organization listing is denied', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgDeveloper');
    const response = await page.request.get(`${api}?organizationId=${seed.primaryOrgId}`);
    expect(response.status()).toBe(403);
  });
});

test.describe('state iac stacks — history and changes', () => {
  test('the history lists the updates and opens what changed in one', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, prod);
    await page.waitForLoadState('networkidle');
    const tabs = page.getByRole('tablist', { name: tabsLabel });

    await tabs.getByRole('tab', { name: 'Historial' }).click();
    const history = page.getByTestId('stack-history');
    await expect(history.locator('li[data-update-id]')).toHaveCount(4);
    await expect(history.locator('li[data-update-id="1789061079158069310"]')).toContainText(
      'fallido',
    );
    // allow-listed environment: commit and author, never the email
    await expect(history).toContainText('Jane Doe');
    await expect(history).not.toContainText('jane@example.com');

    await history
      .locator('li[data-update-id="1795604216162649000"]')
      .getByRole('button', { name: 'Ver cambios' })
      .click();
    const diff = page.getByTestId('stack-diff');
    await expect(diff.getByTestId('diff-summary')).toContainText('Cambios 2');
    const sql = diff.locator('li[data-resource="cloud-sql-acme-prod"]');
    await expect(sql).toHaveAttribute('data-change', 'update');
    await sql.getByRole('button').first().click();
    await expect(sql).toContainText('inputs.publicIp');
  });

  test('shows skeleton rows while the history loads and not after', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.route('**/history?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await expectAllowed(page, prod);
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('tablist', { name: tabsLabel })
      .getByRole('tab', { name: 'Historial' })
      .click();
    const skeleton = page.getByTestId('state-iac-skeleton');
    await expect(skeleton).toBeVisible();
    await expect(page.getByTestId('stack-history').locator('li[data-update-id]')).toHaveCount(4);
    await expect(skeleton).toHaveCount(0);
  });

  test('a replace between two chosen versions', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, prod);
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('tablist', { name: tabsLabel })
      .getByRole('tab', { name: 'Cambios' })
      .click();
    const diff = page.getByTestId('stack-diff');
    await expect(diff.getByTestId('diff-summary')).toBeVisible();
    await diff.getByLabel('Hasta').click();
    // the option label is the source type plus its date; the third update is the one after the replace
    await page
      .getByRole('option', { name: /Update/ })
      .nth(1)
      .click();
    await expect(diff.locator('li[data-resource="lb-prod-cert"]')).toHaveAttribute(
      'data-change',
      'replace',
    );
  });

  test('without history:read nor states:read there is no history nor diff', async ({
    page,
    loginAs,
  }) => {
    await loginAs('stateiacStacksOnly');
    await expectAllowed(page, prod);
    await expect(page.getByRole('tab', { name: 'Historial' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Cambios' })).toHaveCount(0);
  });
});
