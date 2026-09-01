import { test, expect } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const org = seed.primaryOrgSlug;
const settingsRoutes = [
  `/org/${org}/settings/projects`,
  `/org/${org}/settings/access-control`,
  `/org/${org}/settings/roles-permissions`,
  `/org/${org}/settings/global`,
  `/org/${org}/settings/system-backup`,
  `/org/${org}/settings/server-access-keys`,
  `/org/${org}/settings/audit`,
];

test.describe('organization settings — org admin', () => {
  test('sees every organization settings resource', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    for (const route of settingsRoutes) {
      await expectAllowed(page, route);
    }
  });
});

test.describe('organization settings — org developer', () => {
  test('sees only projects, denied everywhere else', async ({ page, loginAs }) => {
    await loginAs('orgDeveloper');
    await expectAllowed(page, `/org/${org}/settings/projects`);
    for (const route of settingsRoutes.filter((r) => !r.endsWith('/projects'))) {
      await expectDenied(page, route);
    }
  });
});

test.describe('organization settings — no org-scope role (project-only access)', () => {
  test('sees the org overview but is denied every settings page', async ({ page, loginAs }) => {
    await loginAs('orgNone');
    await expectAllowed(page, `/org/${org}/overview`);
    for (const route of settingsRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('organization settings — cross-org isolation', () => {
  test('a member of a different org is denied every settings page here', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgOutsider');
    for (const route of settingsRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('organization settings — no access at all', () => {
  test('a bare cluster-user is denied everything', async ({ page, loginAs }) => {
    await loginAs('clusterUserNoAccess');
    await expectDenied(page, `/org/${org}/overview`);
    for (const route of settingsRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('organization roles — "new role" form requires organization:roles:create', () => {
  test('a read-only role is denied, not just missing the Save button', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgProjectsReadOnly');
    await expectDenied(page, `/org/${org}/settings/roles-permissions/new`);
  });
});

test.describe('organization projects — real create mutation', () => {
  test('org admin can create a project and see it in the list', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    const response = await page.request.post(`/org/${org}/settings/projects?/createProject`, {
      form: {
        organizationId: seed.primaryOrgId,
        name: 'E2E Mutation Project',
        slug: 'e2e-mutation-project',
        status: 'active',
      },
    });
    const body = await response.json();
    expect(body.type).not.toBe('failure');

    await page.goto(`/org/${org}/settings/projects`);
    await expect(page.getByText('E2E Mutation Project')).toBeVisible();
  });

  test('a read-only org role gets a 403 on the same POST', async ({ page, loginAs }) => {
    await loginAs('orgProjectsReadOnly');
    const response = await page.request.post(`/org/${org}/settings/projects?/createProject`, {
      form: {
        organizationId: seed.primaryOrgId,
        name: 'Should Not Be Created',
        slug: 'should-not-be-created-org',
        status: 'active',
      },
    });
    const body = await response.json();
    expect(body.type).toBe('failure');
    expect(body.status).toBe(403);
  });
});
