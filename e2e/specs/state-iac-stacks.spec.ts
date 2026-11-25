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

test.describe('state iac stacks — project view', () => {
  test('a user of project A sees its stacks and not those of project B in the same bucket', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, projectA);
    const list = page.getByTestId('stack-backend');
    await expect(list.getByRole('heading', { name: 'e2e-shared-state' })).toBeVisible();
    await expect(list.locator('tr[data-stack="acme-infra/prod"]')).toBeVisible();
    await expect(list.locator('tr[data-stack="acme-infra/staging"]')).toBeVisible();
    await expect(list.locator('tr[data-stack="acme-platform/dev"]')).toHaveCount(0);
    // the lock fixture: an operation in progress on prod
    await expect(
      list.locator('tr[data-stack="acme-infra/prod"]').getByText('En curso'),
    ).toBeVisible();

    // B's stack through A's project, and B's project itself: not found / denied
    const response = await page.goto(`${projectA}/${backend}/acme-platform/dev`);
    expect(response?.status()).toBe(404);
    await expectDenied(page, projectB);
  });

  test('the stack detail shows the resource tree, masked secrets and outputs', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, `${projectA}/${backend}/acme-infra/prod`);
    await expect(page.getByRole('heading', { name: 'prod', level: 1 })).toBeVisible();
    // interactive only once hydrated
    await page.waitForLoadState('networkidle');
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
    await expectAllowed(page, projectA);
    await expect(page.locator('tr[data-stack="acme-infra/prod"]')).toBeVisible();
    await expectAllowed(page, `${projectA}/${backend}/acme-infra/prod`);
    await expect(page.getByTestId('states-forbidden')).toBeVisible();
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

test.describe('state iac stacks — organization view', () => {
  test('the organization sees every stack with its assigned project', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    await expectAllowed(page, `/org/${org}/state-iac`);
    const staging = page.locator('tr[data-stack="acme-infra/staging"]');
    await expect(page.locator('tr[data-stack="acme-infra/prod"]')).toContainText(
      'E2E Primary Project',
    );
    await expect(page.locator('tr[data-stack="acme-platform/dev"]')).toContainText(
      'E2E Secondary Project',
    );
    await expect(staging).toBeVisible();
  });

  test('without organization:stateiac:stacks:read the organization view is denied', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgDeveloper');
    await expectDenied(page, `/org/${org}/state-iac`);
  });
});
