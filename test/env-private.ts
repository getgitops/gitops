import { vi } from 'vitest';

// Keep environment reads live so config tests can change values between calls.
vi.mock('$app/env/private', async () => {
  const { variables } = await import('../src/env');
  return Object.defineProperties(
    {},
    Object.fromEntries(
      Object.keys(variables).map((name) => [
        name,
        { enumerable: true, get: () => process.env[name] },
      ]),
    ),
  );
});
