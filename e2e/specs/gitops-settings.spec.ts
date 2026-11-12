import { test } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';

const clusterRoutes = [
  '/gitops-settings/orgs',
  '/gitops-settings/roles-permissions',
  '/gitops-settings/access-control',
  '/gitops-settings/database',
  '/gitops-settings/audit',
];

test.describe('cluster settings — cluster admin', () => {
  test('sees every cluster settings resource', async ({ page, loginAs }) => {
    await loginAs('clusterAdmin');
    for (const route of clusterRoutes) {
      await expectAllowed(page, route);
    }
  });
});

test.describe('cluster settings — org admin (not a cluster admin)', () => {
  test('is denied every cluster settings resource', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    for (const route of clusterRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('cluster settings — project admin (not a cluster admin)', () => {
  test('is denied every cluster settings resource', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    for (const route of clusterRoutes) {
      await expectDenied(page, route);
    }
  });
});

test.describe('cluster settings — bare cluster-user role', () => {
  test('is denied every cluster settings resource', async ({ page, loginAs }) => {
    await loginAs('clusterUserNoAccess');
    for (const route of clusterRoutes) {
      await expectDenied(page, route);
    }
  });
});
