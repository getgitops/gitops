import { test as base } from '@playwright/test';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { E2E_BASE_URL, E2E_ENCRYPTION_KEY, SEED_OUTPUT_PATH } from '../global-setup';
import type { PersonaKey, SeedOutput } from './seed';

let cachedSeed: SeedOutput | null = null;

export function getSeed(): SeedOutput {
  if (!cachedSeed) {
    cachedSeed = JSON.parse(readFileSync(SEED_OUTPUT_PATH, 'utf-8')) as SeedOutput;
  }
  return cachedSeed;
}

export function sessionTokenFor(userId: string): string {
  const signature = crypto.createHmac('sha256', E2E_ENCRYPTION_KEY).update(userId).digest('hex');
  return `${userId}.${signature}`;
}

type Fixtures = {
  loginAs: (personaKey: PersonaKey) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  loginAs: async ({ context }, use) => {
    await use(async (personaKey: PersonaKey) => {
      const seed = getSeed();
      const persona = seed.personas[personaKey];
      if (!persona) throw new Error(`Unknown persona: ${personaKey}`);
      await context.addCookies([
        {
          name: 'pos_session',
          value: sessionTokenFor(persona.userId),
          url: E2E_BASE_URL,
        },
      ]);
    });
  },
});

export { expect } from '@playwright/test';
