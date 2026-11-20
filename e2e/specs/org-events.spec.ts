import { test, expect, getSeed } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';

const seed = getSeed();
const eventsUrl = `/org/${seed.primaryOrgSlug}/settings/events`;

// a CI run through the machine-to-machine API: the analysis completes and publishes
// code_report.analysis.completed, which the in-memory event log keeps for the page
async function completeAnalysis(request: import('@playwright/test').APIRequestContext) {
  const headers = { Authorization: `Bearer ${seed.apiKeys.write}` };
  const started = await request.post('/api/code-report/scan', {
    headers,
    data: {
      status: 'in_progress',
      service: seed.seededServiceSlug,
      project: seed.primaryProjectSlug,
      tool: 'trivy',
    },
  });
  expect(started.status()).toBe(200);
  const { analysis } = await started.json();

  const completed = await request.post('/api/code-report/scan', {
    headers,
    data: {
      status: 'completed',
      analysisId: analysis.id,
      result: { Results: [{ Vulnerabilities: [{ VulnerabilityID: 'CVE-1', Severity: 'HIGH' }] }] },
    },
  });
  expect(completed.status()).toBe(200);
}

test.describe('organization events page', () => {
  test('an org admin sees a CI analysis event and acknowledges it', async ({
    page,
    request,
    loginAs,
  }) => {
    await completeAnalysis(request);
    await loginAs('orgAdmin');

    await expectAllowed(page, `${eventsUrl}?status=pending`);
    const row = page.locator('li', { hasText: 'Análisis completado' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('API key');

    await row.getByRole('button', { name: 'Marcar como revisado' }).click();
    await expect(row).toContainText(`Revisado por ${seed.personas.orgAdmin.username}`);

    await page.goto(`${eventsUrl}?status=acked`);
    await expect(page.locator('li', { hasText: 'Análisis completado' }).first()).toContainText(
      `Revisado por ${seed.personas.orgAdmin.username}`,
    );
  });

  test('users outside the organization cannot open it', async ({ page, loginAs }) => {
    await loginAs('orgOutsider');
    await expectDenied(page, eventsUrl);
  });

  test('org roles without organization:events:read cannot open it', async ({ page, loginAs }) => {
    await loginAs('orgDeveloper');
    await expectDenied(page, eventsUrl);
  });
});
