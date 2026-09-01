import { test } from '../fixtures/auth';
import { expectAllowed, expectDenied } from '../fixtures/expect-access';
import { getSeed } from '../fixtures/auth';

const seed = getSeed();
const base = `/org/${seed.primaryOrgSlug}/projects/${seed.primaryProjectSlug}`;

test.describe('vault — secrets:read alone is enough', () => {
  test('a role with only project:vault:secrets:read can reach /vault', async ({
    page,
    loginAs,
  }) => {
    await loginAs('vaultSecretsOnly');
    await expectAllowed(page, `${base}/vault`);
  });
});

test.describe('vault — environments:read alone is enough', () => {
  test('a role with only project:vault:environments:read can reach /vault', async ({
    page,
    loginAs,
  }) => {
    await loginAs('vaultEnvironmentsOnly');
    await expectAllowed(page, `${base}/vault`);
  });
});

test.describe('vault — neither grant means denied', () => {
  test('project:project:read alone is not enough for /vault', async ({ page, loginAs }) => {
    await loginAs('projectReadOnly');
    await expectDenied(page, `${base}/vault`);
  });
});

test.describe('state iac — stacks:read alone is enough', () => {
  test('a role with only project:stateiac:stacks:read can reach /state-iac', async ({
    page,
    loginAs,
  }) => {
    await loginAs('stateiacStacksOnly');
    await expectAllowed(page, `${base}/state-iac`);
  });
});

test.describe('state iac — no stateiac grant means denied', () => {
  test('project:project:read alone is not enough for /state-iac', async ({ page, loginAs }) => {
    await loginAs('projectReadOnly');
    await expectDenied(page, `${base}/state-iac`);
  });
});
