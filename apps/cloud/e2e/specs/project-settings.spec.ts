import { test, expect } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const org = seed.primaryOrgSlug;
const project = seed.primaryProjectSlug;
const base = `/org/${org}/projects/${project}`;

const settingsRoutes = [
  `${base}/settings/overview`,
  `${base}/settings/access-control`,
  `${base}/settings/roles-permissions`,
  `${base}/settings/server-access-keys`,
  `${base}/settings/audit`,
];

test('project admin sees every project settings resource', async ({ page, loginAs }) => {
  await loginAs('projectAdmin');
  for (const route of settingsRoutes) {
    await expectAllowed(page, route);
  }
});

test('a project outsider (role on a different project) is denied everything here', async ({
  page,
  loginAs,
}) => {
  await loginAs('projectOutsider');
  for (const route of settingsRoutes) {
    await expectDenied(page, route);
  }
});

test.describe('project overview — read-only role (project:project:read only)', () => {
  test('Danger Zone and Save are hidden, fields render as read-only text', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectReadOnly');
    await page.goto(`${base}/settings/overview`);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Zona de peligro' })).toHaveCount(0);
    // the name field must not be an editable input when read-only
    await expect(page.locator('input#edit-project-name')).toHaveCount(0);
  });
});

test.describe('project overview — project admin', () => {
  test('Danger Zone and Save are visible, name field is editable', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/settings/overview`);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zona de peligro' })).toBeVisible();
    await expect(page.locator('input#edit-project-name')).toBeVisible();
  });
});

test.describe('server access keys — no delete permission', () => {
  test('Rotate is visible, Revoke is not', async ({ page, loginAs }) => {
    await loginAs('projectServerKeysNoDelete');
    await page.goto(`${base}/settings/server-access-keys`);
    await expect(page.getByRole('button', { name: 'Crear key' })).toBeVisible();
    await expect(page.getByRole('button', { name: /rotar|regenerar/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /revocar|eliminar/i })).toHaveCount(0);
  });
});

test.describe('server access keys — no update permission', () => {
  test('neither Rotate nor Revoke are visible', async ({ page, loginAs }) => {
    await loginAs('projectServerKeysNoUpdate');
    await page.goto(`${base}/settings/server-access-keys`);
    await expect(page.getByRole('button', { name: /rotar|regenerar/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /revocar|eliminar/i })).toHaveCount(0);
  });
});

test.describe('server access keys — real revoke mutation', () => {
  // posted directly (not clicked through the UI): the modal's confirm button depends on
  // client-side hydration, which is unrelated to what this test cares about — whether the
  // server actually revokes the key for a role with delete permission, not whether the click
  // wiring works.
  test('a role with delete permission can actually revoke a key', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/settings/server-access-keys`);
    const before = await page.getByRole('button', { name: /revocar/i }).count();

    const keyId = await page.locator('input[name="keyId"]').first().getAttribute('value');
    expect(keyId, 'expected at least one seeded key on the page').toBeTruthy();

    const response = await page.request.post(`${base}/settings/server-access-keys?/revoke`, {
      form: { keyId: keyId! },
    });
    const body = await response.json();
    expect(body.type).not.toBe('failure');

    await page.reload();
    await expect(page.getByRole('button', { name: /revocar/i })).toHaveCount(before - 1);
  });
});

test.describe('project users/roles — read guard (no project:users:read / project:roles:read)', () => {
  test('a project:project:read-only role is denied the user list', async ({ page, loginAs }) => {
    await loginAs('projectReadOnly');
    await expectDenied(page, `${base}/settings/access-control`);
  });

  test('a project:project:read-only role is denied the role list and detail', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectReadOnly');
    await expectDenied(page, `${base}/settings/roles-permissions`);
  });

  test('a project:project:read-only role is denied the "new role" form', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectReadOnly');
    await expectDenied(page, `${base}/settings/roles-permissions/new`);
  });
});

test.describe('project users — role-change control (canUpdate)', () => {
  test('a role without project:users:update sees a static label, not the dropdown', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectUsersNoUpdate');
    await page.goto(`${base}/settings/access-control`);
    // the role-change trigger is a <button>; without update permission it must not render as one
    await expect(page.locator('table button:has-text("Project Admin")')).toHaveCount(0);
  });

  test('project admin sees the interactive role-change dropdown', async ({ page, loginAs }) => {
    await loginAs('projectAdmin');
    await page.goto(`${base}/settings/access-control`);
    await expect(page.locator('table button').first()).toBeVisible();
  });
});

test.describe('project roles — real create mutation', () => {
  test('project admin can create a role and see it in the list', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectAdmin');
    const response = await page.request.post(`${base}/settings/roles-permissions/new?/createRole`, {
      form: {
        name: 'E2E Mutation Role',
        slug: 'e2e-mutation-role',
        permissions: JSON.stringify(['project:project:read']),
      },
    });
    const body = await response.json();
    expect(body.type).not.toBe('failure');

    await page.goto(`${base}/settings/roles-permissions`);
    await expect(page.getByText('E2E Mutation Role')).toBeVisible();
  });

  test('a role without project:roles:create gets a 403 on the same POST', async ({
    page,
    loginAs,
  }) => {
    await loginAs('projectViewer');
    const response = await page.request.post(`${base}/settings/roles-permissions/new?/createRole`, {
      form: {
        name: 'Should Not Be Created',
        slug: 'should-not-be-created',
        permissions: JSON.stringify(['project:project:read']),
      },
    });
    // SvelteKit wraps a fail()'d action in a 200-transport JSON envelope, with the real status
    // inside the body — not on the HTTP response itself.
    const body = await response.json();
    expect(body.type).toBe('failure');
    expect(body.status).toBe(403);
  });
});
