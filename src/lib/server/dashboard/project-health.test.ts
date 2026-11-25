import { beforeEach, describe, expect, it, vi } from 'vitest';

const listKeys = vi.fn();

vi.mock('#modules/auth', () => ({
  apiKeysService: { listActiveApiKeysByProject: (projectId: string) => listKeys(projectId) },
}));
vi.mock('#modules/code-report', () => ({ codeReportService: {}, codeReportAnalysisService: {} }));
vi.mock('#modules/monitoring', () => ({ monitorService: {}, monitoringRuntime: {} }));
vi.mock('#modules/vault', () => ({ vaultService: {} }));

const { DAY_MS, keyHealth } = await import('./project-health');

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();
const inDays = (days: number) => new Date(NOW + days * DAY_MS).toISOString();

function key(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.name),
    name: 'key',
    keyPrefix: 'gk_abc',
    userId: null,
    projectId: 'project-1',
    roleId: null,
    createdByUserId: null,
    expiresAt: inDays(60),
    lastUsedAt: daysAgo(1),
    revokedAt: null,
    rotatedAt: null,
    createdAt: daysAgo(10),
    ...overrides,
  };
}

describe('keyHealth', () => {
  beforeEach(() => listKeys.mockReset());

  it('flags each risk and leaves healthy keys out', async () => {
    listKeys.mockResolvedValue([
      key({ name: 'healthy' }),
      key({ name: 'expired', expiresAt: daysAgo(1) }),
      key({ name: 'expiring', expiresAt: inDays(5) }),
      key({ name: 'no-expiry', expiresAt: null }),
      key({ name: 'old', createdAt: daysAgo(200) }),
      key({ name: 'idle', lastUsedAt: daysAgo(45) }),
      key({ name: 'revoked', revokedAt: daysAgo(2), expiresAt: daysAgo(1) }),
    ]);

    const health = await keyHealth('project-1', NOW);

    expect(health.active).toBe(6);
    const risks = Object.fromEntries(health.atRisk.map((entry) => [entry.name, entry.risks]));
    expect(risks).toEqual({
      expired: ['expired'],
      expiring: ['expiring'],
      'no-expiry': ['noExpiry'],
      old: ['notRotated'],
      idle: ['unused'],
    });
    expect(health.atRisk[0].name).toBe('expired');
    expect(health.counts).toEqual({
      expired: 1,
      expiring: 1,
      noExpiry: 1,
      notRotated: 1,
      unused: 1,
    });
  });

  it('counts rotation from the last regeneration, not from creation', async () => {
    listKeys.mockResolvedValue([
      key({ name: 'rotated', createdAt: daysAgo(400), rotatedAt: daysAgo(3) }),
    ]);

    const health = await keyHealth('project-1', NOW);

    expect(health.atRisk).toEqual([]);
  });

  it('treats a never-used key as unused once it is older than the threshold', async () => {
    listKeys.mockResolvedValue([
      key({ name: 'fresh', lastUsedAt: null, createdAt: daysAgo(5) }),
      key({ name: 'forgotten', lastUsedAt: null, createdAt: daysAgo(40) }),
    ]);

    const health = await keyHealth('project-1', NOW);

    expect(health.atRisk.map((entry) => entry.name)).toEqual(['forgotten']);
  });
});
