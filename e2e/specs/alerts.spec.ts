import { test, expect, getSeed } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { E2E_BASE_URL } from '../global-setup';

const seed = getSeed();
const projectBase = `/org/${seed.primaryOrgSlug}/projects/${seed.primaryProjectSlug}`;
const alertsUrl = `${projectBase}/settings/alerts`;
const orgAlertsUrl = `/org/${seed.primaryOrgSlug}/settings/alerts`;

const GUIDED_NAME = 'Críticas en el servicio sembrado';

// the editor is interactive only once hydrated: before that, a select change is reset by Svelte
async function openEditor(page: import('@playwright/test').Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

test.describe.configure({ mode: 'serial' });

test.describe('project alerts', () => {
  test('a project admin creates the guided example and tests it first', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await expectAllowed(page, alertsUrl);
    await expect(page.getByText('Todavía no hay alertas')).toBeVisible();
    // e2e runs without SMTP: the page says alerts won't be sent
    await expect(page.getByTestId('mail-disabled')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crear alerta' }).first()).toHaveAttribute(
      'href',
      `${alertsUrl}/new`,
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Crear alerta' }).first().click();
    const wizard = page.getByRole('dialog', { name: 'Nueva alerta' });
    await expect(wizard).toBeVisible();
    // the wizard is a modal: the URL does not change
    await expect(page).toHaveURL(new RegExp(`${alertsUrl}$`));

    // step 1: event
    await wizard.getByRole('radio', { name: /^Análisis completado/ }).click();
    await wizard.getByRole('button', { name: 'Siguiente' }).click();

    // step 2: Servicio es <seeded service> · Vulnerabilidades críticas mayor que 0
    const builder = wizard.getByTestId('condition-builder');
    await builder.getByRole('button', { name: 'Añadir condición' }).click();
    const first = builder.getByTestId('condition-row').nth(0);
    await first.getByLabel('Campo').click();
    await page.getByRole('option', { name: 'Servicio', exact: true }).click();
    await first.getByLabel('Operador').click();
    await page.getByRole('option', { name: 'es', exact: true }).click();
    await first.getByRole('radio', { name: 'E2E Seeded Service' }).check();

    await builder.getByRole('button', { name: 'Añadir condición' }).click();
    const second = builder.getByTestId('condition-row').nth(1);
    await second.getByLabel('Campo').click();
    await page.getByRole('option', { name: 'Vulnerabilidades críticas', exact: true }).click();
    await second.getByLabel('Operador').click();
    await page.getByRole('option', { name: 'mayor que', exact: true }).click();
    await second.getByLabel('Valor').fill('0');
    await wizard.getByRole('button', { name: 'Siguiente' }).click();

    // step 3: email is on by default; a role from the suggestions plus an external address
    const targets = wizard.getByLabel('Destinatarios');
    await targets.fill('Project Ad');
    await page.getByRole('option', { name: 'Project Admin', exact: true }).click();
    await targets.fill('oncall@example.com');
    await targets.press('Enter');
    await wizard.getByRole('radio', { name: '1 hora' }).click();
    await wizard.getByRole('button', { name: 'Siguiente' }).click();

    // step 4: name, dry run (nothing is sent) and create
    await wizard.getByLabel('Nombre', { exact: true }).fill(GUIDED_NAME);
    await wizard.getByRole('button', { name: 'Probar alerta' }).click();
    const result = wizard.getByTestId('alert-test-result');
    await expect(result).toContainText('El evento de ejemplo cumple las condiciones.');
    await expect(result).toContainText(seed.personas.projectAdmin.username);
    await expect(result).toContainText('oncall@example.com');
    await expect(result).toContainText('no se ha enviado ningún email');

    await wizard.getByRole('button', { name: 'Crear alerta' }).click();
    await expect(wizard).toBeHidden();

    const row = page.getByTestId('alert-row').filter({ hasText: GUIDED_NAME });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('alert-summary')).toHaveText(
      'Servicio es E2E Seeded Service y Vulnerabilidades críticas mayor que 0',
    );
    await expect(row).toContainText('Project Admin');
    await expect(row).toContainText('oncall@example.com');
    await expect(row).toContainText('Máx. un email cada 60 min');
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  test('an alert can notify several channels and is edited in the same wizard', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await page.goto(alertsUrl);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('alert-row').filter({ hasText: GUIDED_NAME });
    await row.getByRole('link', { name: 'Editar' }).click();
    const wizard = page.getByRole('dialog', { name: 'Editar alerta' });
    await expect(wizard.getByLabel('Nombre', { exact: true })).toHaveValue(GUIDED_NAME);

    await wizard.getByRole('button', { name: /Destinos/ }).click();
    await wizard.getByRole('checkbox', { name: /^Slack/ }).click();
    await wizard.getByRole('checkbox', { name: /^Webhook/ }).click();
    // a destination without targets keeps "Next" disabled
    await expect(wizard.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    const slack = wizard.getByLabel('Canales de Slack');
    await slack.fill('Alertas Prod');
    await slack.press('Enter');
    await expect(wizard.getByText('Usa nombres de canal de Slack como #alertas.')).toBeVisible();
    await slack.fill('alertas-prod');
    await slack.press('Enter');
    const webhook = wizard.getByLabel('URLs');
    await webhook.fill('https://hooks.example.com/gitops');
    await webhook.press('Enter');
    await wizard.getByRole('button', { name: 'Siguiente' }).click();
    await wizard.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(wizard).toBeHidden();

    await expect(row).toContainText('#alertas-prod');
    await expect(row).toContainText('https://hooks.example.com/gitops');
    await expect(row).toContainText('oncall@example.com');
  });

  test('server validation errors show next to their field', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await openEditor(page, `${alertsUrl}/new`);
    await page.getByLabel('Evento', { exact: true }).selectOption({ label: 'Análisis completado' });
    await page.getByRole('button', { name: 'Crear alerta' }).click();

    await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveAttribute(
      'aria-describedby',
      'alert-name-error',
    );
  });

  test('a project viewer sees the list without any management action', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectViewer');
    await expectAllowed(page, alertsUrl);
    const row = page.getByTestId('alert-row').filter({ hasText: GUIDED_NAME });
    await expect(row).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crear alerta' })).toHaveCount(0);
    await expect(row.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Borrar' })).toHaveCount(0);
    await expect(row.getByRole('switch')).toHaveCount(0);

    // the server refuses the same actions when they are posted directly
    const headers = { origin: E2E_BASE_URL };
    const save = await page.request.post(`${alertsUrl}/new?/save`, {
      headers,
      form: { name: 'x', eventType: 'code_report.analysis.completed', roleIds: 'any' },
    });
    expect(save.status()).toBe(403);

    const api = await page.request.post('/api/alerts', {
      data: { projectId: 'irrelevant', name: 'x' },
    });
    expect([403, 404]).toContain(api.status());
    await expectDenied(page, `${alertsUrl}/new`);
  });

  test('the sidebar only shows alerts to people who can read them', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    await page.goto(`${projectBase}/settings/overview`);
    await expect(page.locator(`a[href="${alertsUrl}"]`)).toHaveCount(1);

    await loginAs('vaultSecretsOnly');
    await page.goto(`${projectBase}/vault`);
    await expect(page.locator(`a[href="${alertsUrl}"]`)).toHaveCount(0);
    await expectDenied(page, alertsUrl);
  });

  test('people outside the project cannot reach its alerts', async ({ page, loginAs }) => {
    await loginAs('projectOutsider');
    await expectDenied(page, alertsUrl);
    await loginAs('orgOutsider');
    await expectDenied(page, orgAlertsUrl);
  });

  test('the API requires authentication', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
    const response = await anonymous.get(`/api/alerts?organizationId=${seed.primaryOrgId}`);
    expect(response.status()).toBe(401);
    await anonymous.dispose();
  });
});

test.describe('organization alerts', () => {
  test('the project page lists organization alerts as read-only inherited ones', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgAdmin');
    await expectAllowed(page, orgAlertsUrl);
    await openEditor(page, `${orgAlertsUrl}/new`);
    await page.getByLabel('Nombre', { exact: true }).fill('Todos los análisis fallidos');
    await page.getByLabel('Evento', { exact: true }).selectOption({ label: 'Análisis fallido' });
    await page.getByRole('checkbox', { name: 'Org Admin' }).check();
    await page.getByRole('button', { name: 'Crear alerta' }).click();
    await expect(
      page.getByTestId('alert-row').filter({ hasText: 'Todos los análisis fallidos' }),
    ).toBeVisible();

    await loginAs('projectAdmin');
    await page.goto(alertsUrl);
    const inherited = page.getByTestId('inherited-alerts');
    await expect(inherited).toContainText('Todos los análisis fallidos');
    await expect(inherited.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(inherited.getByRole('switch')).toHaveCount(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the editor still creates an alert through form actions', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${alertsUrl}/new`);

    await page.getByLabel('Nombre', { exact: true }).fill('Sin JS');
    await page.getByLabel('Evento', { exact: true }).selectOption({ label: 'Análisis completado' });
    await page.getByRole('button', { name: 'Usar este evento' }).click();

    // ?/draft re-renders the form with one condition row for the chosen event
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    const row = page.getByTestId('condition-row').first();
    await expect(row.getByLabel('Campo')).toHaveValue('serviceId');
    await row.getByRole('radio', { name: 'E2E Seeded Service' }).check();
    await page.getByRole('checkbox', { name: 'Project Admin' }).check();

    await page.getByRole('button', { name: 'Crear alerta' }).click();
    await expect(page).toHaveURL(new RegExp(`${alertsUrl}\\?saved=`));
    await expect(
      page.getByTestId('alert-row').filter({ hasText: 'Sin JS' }).getByTestId('alert-summary'),
    ).toHaveText('Servicio es E2E Seeded Service');
  });
});
