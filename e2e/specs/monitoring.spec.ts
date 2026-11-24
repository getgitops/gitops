import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, getSeed } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { E2E_BASE_URL, E2E_MONITORING_WORKER_TOKEN } from '../global-setup';

const seed = getSeed();
const projectBase = `/org/${seed.primaryOrgSlug}/projects/${seed.primaryProjectSlug}`;
const base = `${projectBase}/monitoring`;

// a local target the checks hit (the e2e server runs with MONITORING_ALLOW_PRIVATE_TARGETS=true)
let target: http.Server;
let targetUrl = '';
const receivedAuth: (string | undefined)[] = [];

test.beforeAll(async () => {
  target = http.createServer((req, res) => {
    receivedAuth.push(req.headers.authorization);
    if (req.url?.startsWith('/fail')) return res.writeHead(503).end('down');
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
  });
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  target.closeAllConnections();
  target.close();
});

async function createMonitor(
  page: import('@playwright/test').Page,
  input: { name: string; path: string; header?: string; confirmations?: string; query?: string },
) {
  await page.goto(`${base}/monitors/new${input.query ?? ''}`);
  await page.getByLabel('Nombre', { exact: true }).fill(input.name);
  await page.getByLabel('URL', { exact: true }).fill(`${targetUrl}${input.path}`);
  if (input.header) {
    await page.getByLabel('Nombre del header').first().fill('Authorization');
    await page.getByLabel('Valor del header').first().fill(input.header);
  }
  if (input.confirmations) {
    await page.getByText('Condiciones', { exact: true }).click();
    await page.getByLabel('Confirmaciones').fill(input.confirmations);
  }
  await page.getByRole('button', { name: 'Crear monitor' }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/monitors/[0-9a-f-]{36}$`));
  return page.url().split('/').at(-1)!;
}

/** Reloads until the monitor shows `status` (the embedded worker checks a new monitor at once). */
async function waitForStatus(page: import('@playwright/test').Page, status: string) {
  await expect(async () => {
    await page.reload();
    await expect(page.locator('h1 + p + div').getByText(status, { exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
}

test.describe('monitoring — access', () => {
  test('a role without monitoring permissions is denied every page', async ({ page, loginAs }) => {
    await loginAs('projectReadOnly');
    for (const route of [`${base}/dashboard`, `${base}/monitors`, `${base}/monitors/new`]) {
      await expectDenied(page, route);
    }
  });

  test('a viewer sees the dashboard and the list but cannot create', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    await expectAllowed(page, `${base}/dashboard`);
    await expect(page.getByRole('link', { name: 'Nuevo monitor' })).toHaveCount(0);
    await expectAllowed(page, `${base}/monitors`);
    await expectDenied(page, `${base}/monitors/new`);
  });

  test('the sidebar shows the Monitoring category', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/dashboard`);
    await expect(page.getByText('Monitorización', { exact: true })).toBeVisible();
  });
});

test.describe('monitoring — monitors', () => {
  test('tests a draft, creates the monitor and gets its first check', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/monitors/new`);
    await page.getByLabel('Nombre', { exact: true }).fill('E2E health');
    await page.getByLabel('URL', { exact: true }).fill(`${targetUrl}/health`);
    await page.getByLabel('Nombre del header').first().fill('Authorization');
    await page.getByLabel('Valor del header').first().fill('Bearer e2e-secret');

    await page.getByRole('button', { name: 'Probar' }).click();
    await expect(page.getByText('La comprobación ha ido bien')).toBeVisible();
    await expect(page.getByText('HTTP 200')).toBeVisible();
    expect(receivedAuth).toContain('Bearer e2e-secret');
    // the test keeps what was typed
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('E2E health');

    await page.getByRole('button', { name: 'Crear monitor' }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/monitors/[0-9a-f-]{36}$`));
    await expect(page.getByRole('heading', { name: 'E2E health' })).toBeVisible();
    await waitForStatus(page, 'Operativo');
    await expect(page.getByRole('heading', { name: 'Tiempo de respuesta' })).toBeVisible();
    await expect(page.locator('canvas[aria-label="Tiempo de respuesta"]')).toBeVisible();

    // the stored header value never reaches the browser again
    await page.getByRole('link', { name: 'Editar' }).click();
    expect(await page.content()).not.toContain('e2e-secret');
    await expect(page.getByLabel('Nombre del header').first()).toHaveValue('Authorization');
  });

  test('a failing target opens an incident', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await createMonitor(page, { name: 'E2E failing', path: '/fail', confirmations: '1' });
    await waitForStatus(page, 'Caído');
    await expect(page.getByText('Incidencia abierta: caído')).toBeVisible();
    await expect(page.getByText('Código HTTP inesperado').first()).toBeVisible();

    await page.goto(`${base}/dashboard`);
    await expect(page.getByRole('heading', { name: /caídos/ })).toBeVisible();
  });

  test('a monitor linked to a service shows on the service page', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${projectBase}/code-report/services/${seed.seededServiceSlug}`);
    await page.getByRole('link', { name: 'Añadir monitor' }).click();
    await expect(page).toHaveURL(/monitors\/new\?serviceId=/);
    const serviceId = new URL(page.url()).searchParams.get('serviceId');
    await expect(page.getByLabel('Servicio')).toHaveValue(serviceId!);
    await page.getByLabel('Nombre', { exact: true }).fill('E2E service monitor');
    await page.getByLabel('URL', { exact: true }).fill(`${targetUrl}/svc`);
    await page.getByRole('button', { name: 'Crear monitor' }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/monitors/[0-9a-f-]{36}$`));

    await page.goto(`${projectBase}/code-report/services/${seed.seededServiceSlug}`);
    await expect(page.getByText('E2E service monitor')).toBeVisible();
  });

  test('reports invalid input field by field', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/monitors/new`);
    await page.getByLabel('Nombre', { exact: true }).fill('Broken');
    await page.getByLabel('URL', { exact: true }).fill(`${targetUrl}/x`);
    await page.getByText('Condiciones', { exact: true }).click();
    await page.getByLabel('Códigos esperados').fill('2xx');
    await page.getByRole('button', { name: 'Crear monitor' }).click();
    await expect(page.getByText('Usa códigos 100-599 o rangos')).toBeVisible();
  });

  test('a developer can create but not delete', async ({ page, loginAs }) => {
    await loginAs('projectDeveloper');
    await createMonitor(page, { name: 'E2E developer monitor', path: '/dev' });
    await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();
    await expect(page.getByTitle('Eliminar')).toHaveCount(0);
  });

  test('an admin pauses and deletes a monitor', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await createMonitor(page, { name: 'E2E to delete', path: '/delete' });
    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByText('Pausado', { exact: true }).first()).toBeVisible();
    // the confirmation dialog is client-side: wait for the page to hydrate
    await page.waitForLoadState('networkidle');
    await page.getByTitle('Eliminar').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/monitors$`));
    await expect(page.getByText('E2E to delete')).toHaveCount(0);
  });
});

test.describe('monitoring — internal worker API', () => {
  const lease = (headers: Record<string, string>, body: unknown) =>
    fetch(`${E2E_BASE_URL}/api/internal/monitoring/lease`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  test('refuses requests without the worker token, even with a session', async () => {
    expect((await lease({}, { workerId: 'w', capacity: 1 })).status).toBe(401);
    expect(
      (await lease({ authorization: 'Bearer wrong' }, { workerId: 'w', capacity: 1 })).status,
    ).toBe(401);
  });

  test('leases checks and accepts results with the token', async () => {
    const auth = { authorization: `Bearer ${E2E_MONITORING_WORKER_TOKEN}` };
    expect((await lease(auth, { capacity: 1 })).status).toBe(400);

    const response = await lease(auth, {
      workerId: 'e2e-external-worker',
      region: 'test',
      capacity: 0,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checks: [], pollAfterMs: expect.any(Number) });

    const report = await fetch(`${E2E_BASE_URL}/api/internal/monitoring/results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        workerId: 'e2e-external-worker',
        results: [
          {
            leaseId: 'not-a-lease',
            monitorId: 'nope',
            outcome: {
              status: 'up',
              cause: null,
              httpStatus: 200,
              latencyMs: 5,
              error: null,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
            },
          },
        ],
      }),
    });
    expect(await report.json()).toEqual({ accepted: 0, rejected: 1 });
  });
});
