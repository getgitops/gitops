import { test, expect } from '@playwright/test';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const scanUrl = '/api/code-report/scan';

function startBody(overrides: Record<string, unknown> = {}) {
  return {
    status: 'start',
    service: seed.seededServiceSlug,
    project: seed.primaryProjectSlug,
    tool: 'trivy',
    ...overrides,
  };
}

test('no Authorization header is rejected', async ({ request }) => {
  const response = await request.post(scanUrl, { data: startBody() });
  expect(response.status()).toBe(401);
});

test('an invalid bearer token is rejected', async ({ request }) => {
  const response = await request.post(scanUrl, {
    headers: { Authorization: 'Bearer gvs_not_a_real_token' },
    data: startBody(),
  });
  expect(response.status()).toBe(401);
});

test('a read-only key (no codereport:create) is denied', async ({ request }) => {
  const response = await request.post(scanUrl, {
    headers: { Authorization: `Bearer ${seed.apiKeys.readOnly}` },
    data: startBody(),
  });
  expect(response.status()).toBe(403);
});

test('a key with codereport:create can start a scan for its own project', async ({ request }) => {
  const response = await request.post(scanUrl, {
    headers: { Authorization: `Bearer ${seed.apiKeys.write}` },
    data: startBody(),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
});

test('a key scoped to a different project is denied (cross-project isolation)', async ({
  request,
}) => {
  // valid, working key — just scoped to the outsider project, not the primary one it's targeting
  const response = await request.post(scanUrl, {
    headers: { Authorization: `Bearer ${seed.apiKeys.outsiderProject}` },
    data: startBody(),
  });
  expect(response.status()).toBe(403);
});

test('a project-scoped key cannot be used on a non-API browser route', async ({ request }) => {
  const response = await request.get(
    `/org/${seed.primaryOrgSlug}/projects/${seed.primaryProjectSlug}/settings/overview`,
    { headers: { Authorization: `Bearer ${seed.apiKeys.write}` } },
  );
  expect(response.status()).toBe(401);
});
