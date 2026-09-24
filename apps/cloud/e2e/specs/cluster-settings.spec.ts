import { test } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';

const clusterRoutes = [
  '/cluster-settings/orgs',
  '/cluster-settings/roles-permissions',
  '/cluster-settings/access-control',
  '/cluster-settings/database',
  '/cluster-settings/audit',
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
