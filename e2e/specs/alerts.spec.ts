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
    await targets.press('Escape');
    await wizard.getByRole('radio', { name: '1 hora' }).click();
    await wizard.getByRole('button', { name: 'Siguiente' }).click();

    // step 4: name, dry run (nothing is sent) and create
    await wizard.getByLabel('Nombre', { exact: true }).fill(GUIDED_NAME);
    await wizard.getByRole('button', { name: 'Probar alerta' }).click();
    const result = wizard.getByTestId('alert-test-result');
    await expect(result).toContainText('El evento de ejemplo cumple las condiciones.');
    await expect(result).toContainText(seed.personas.projectAdmin.username);
    await expect(result).toContainText('oncall@example.com');
    await expect(result).toContainText('Sin añadir');
    await expect(result).toContainText('no se ha enviado nada');

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

  test('without channels only email can be picked and the alert is edited in the same wizard', async ({
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
    const channels = wizard.getByTestId('alert-channels');
    await expect(channels.getByRole('checkbox', { name: /^Email/ })).toBeEnabled();
    for (const type of ['slack', 'google-chat', 'webhook']) {
      const card = channels.locator(`[data-channel-type="${type}"]`);
      await expect(card.getByRole('checkbox')).toBeDisabled();
      await expect(card).toContainText('No configurado');
      await expect(card.getByRole('link', { name: 'Configurar' })).toBeVisible();
    }

    const targets = wizard.getByLabel('Destinatarios');
    await targets.fill('ops@example.com');
    await targets.press('Enter');
    await wizard.getByRole('button', { name: 'Siguiente' }).click();
    await wizard.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(wizard).toBeHidden();

    await expect(row).toContainText('ops@example.com');
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

  test('the alert settings open in a modal from the list and save the allowed domains', async ({
    page,
    loginAs,
  }) => {
    await loginAs('orgAdmin');
    await page.goto(orgAlertsUrl);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('alert-settings').click();
    const dialog = page.getByRole('dialog', { name: 'Configuración de alertas' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${orgAlertsUrl}$`));

    const domains = dialog.getByLabel('Dominios (uno por línea)');
    await expect(domains).toHaveValue('example.com');
    await domains.fill('example.com\npartner.com');
    await dialog.getByRole('button', { name: 'Guardar dominios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Dominios guardados' })).toBeVisible();
    await expect(domains).toHaveValue('example.com\npartner.com');
  });

  test('project admins manage the project channels, not the organization domains', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await page.goto(alertsUrl);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('alert-settings').click();
    const dialog = page.getByRole('dialog', { name: 'Configuración de alertas' });
    const channels = dialog.getByTestId('notification-channels');
    await expect(channels).toBeVisible();
    await expect(dialog.getByLabel('Dominios (uno por línea)')).toHaveCount(0);

    // a webhook channel shows its signing secret once, and rotating it asks first
    const types = channels.getByTestId('channel-type-cards');
    await expect(types.getByRole('radio', { name: /Slack/ })).toBeEnabled();
    await expect(types.getByRole('radio', { name: /Google Chat/ })).toBeDisabled();
    await expect(types.locator('[data-channel-type="google-chat"]')).toContainText('Próximamente');
    await expect(types.getByRole('radio', { name: /Webhook/ })).toBeChecked();
    await channels.getByLabel('Nombre', { exact: true }).fill('SIEM e2e');
    await channels.getByLabel('URL del webhook').fill('https://receiver.example.com/gitops');
    await channels.getByRole('button', { name: 'Añadir canal' }).click();

    const secret = page.getByRole('dialog', { name: 'Secreto de firma' });
    await expect(secret.getByTestId('channel-secret')).toHaveText(/^whsec_[0-9a-f]{64}$/);
    const first = await secret.getByTestId('channel-secret').textContent();
    await secret.getByTestId('channel-secret-done').click();
    await expect(secret).toBeHidden();

    const row = channels.locator('li[data-channel-id]').filter({ hasText: 'SIEM e2e' });
    await expect(row).toContainText('Firmado');
    await expect(row).not.toContainText('whsec_');

    await row.getByTestId('channel-rotate').click();
    const confirm = page.getByRole('alertdialog', { name: '¿Rotar el secreto de firma?' });
    await confirm.getByTestId('channel-rotate-confirm').click();
    await expect(secret.getByTestId('channel-secret')).toHaveText(/^whsec_[0-9a-f]{64}$/);
    await expect(secret.getByTestId('channel-secret')).not.toHaveText(first!);
    await secret.getByTestId('channel-secret-done').click();
    await expect(row).toContainText('El secreto anterior es válido hasta');

    await types.locator('[data-channel-type="slack"]').click();
    await expect(types.getByRole('radio', { name: /Slack/ })).toBeChecked();
    for (const [name, hook, locale, language] of [
      ['#seguridad-e2e', 'https://hooks.slack.com/services/T000/B001/aaaa', 'es', 'Español'],
      ['#incidencias-e2e', 'https://hooks.slack.com/services/T000/B002/bbbb', 'en', 'Inglés'],
    ]) {
      await channels.getByLabel('Nombre', { exact: true }).fill(name);
      await channels.getByLabel('URL del webhook').fill(hook);
      await channels.getByLabel('Idioma de los mensajes').selectOption(locale);
      await channels.getByRole('button', { name: 'Añadir canal' }).click();
      const slackRow = channels.locator('li[data-channel-id]').filter({ hasText: name });
      await expect(slackRow).toContainText('Slack');
      await expect(slackRow.getByTestId('channel-locale')).toHaveText(language);
      await expect(slackRow).not.toContainText('Firmado');
      await expect(slackRow).not.toContainText(hook);
    }

    await channels.getByLabel('Nombre', { exact: true }).fill('#otro');
    await channels
      .getByLabel('URL del webhook')
      .fill('https://hooks.slack.com.evil.example/services/x');
    await channels.getByRole('button', { name: 'Añadir canal' }).click();
    await expect(
      channels.getByText('Ese dominio no está permitido para este tipo de canal.'),
    ).toBeVisible();
  });

  test('an alert posts to the Slack channels picked in the wizard', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(alertsUrl);
    await page.waitForLoadState('networkidle');
    const row = page.getByTestId('alert-row').filter({ hasText: GUIDED_NAME });
    await row.getByRole('link', { name: 'Editar' }).click();
    const wizard = page.getByRole('dialog', { name: 'Editar alerta' });
    await wizard.getByRole('button', { name: /Destinos/ }).click();

    const channels = wizard.getByTestId('alert-channels');
    const slackCard = channels.locator('[data-channel-type="slack"]');
    await expect(slackCard).not.toContainText('No configurado');
    await slackCard.getByRole('checkbox').click();
    await expect(slackCard.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

    const seguridad = wizard.getByRole('checkbox', { name: /#seguridad-e2e/ });
    const incidencias = wizard.getByRole('checkbox', { name: /#incidencias-e2e/ });
    await expect(seguridad).toBeChecked();
    await expect(incidencias).toBeChecked();
    await incidencias.uncheck();

    await wizard.getByRole('button', { name: 'Siguiente' }).click();
    await expect(wizard).toContainText('#seguridad-e2e');
    await expect(wizard).not.toContainText('#incidencias-e2e');
    await wizard.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(wizard).toBeHidden();

    await row.getByRole('link', { name: 'Editar' }).click();
    await wizard.getByRole('button', { name: /Destinos/ }).click();
    await expect(wizard.getByRole('checkbox', { name: /#seguridad-e2e/ })).toBeChecked();
    await expect(wizard.getByRole('checkbox', { name: /#incidencias-e2e/ })).not.toBeChecked();
  });

  test('a project viewer gets no settings button', async ({ page, loginAs }) => {
    await loginAs('projectViewer');
    await page.goto(alertsUrl);
    await expect(page.getByTestId('alert-settings')).toHaveCount(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the alert settings button opens the settings page', async ({ page, loginAs }) => {
    await loginAs('orgAdmin');
    await page.goto(orgAlertsUrl);
    await page.getByTestId('alert-settings').click();
    await expect(page).toHaveURL(new RegExp(`${orgAlertsUrl}/settings$`));
    await expect(page.getByRole('heading', { name: 'Configuración de alertas' })).toBeVisible();
    await expect(page.getByLabel('Dominios (uno por línea)')).toHaveValue(/example\.com/);
  });

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
