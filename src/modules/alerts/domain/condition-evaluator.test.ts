import { describe, expect, it } from 'vitest';
import { getEventDefinition, type EventDefinition, type FieldType } from '#lib/events/catalog';
import type { CodeReportAnalysisCompletedPayload } from '#lib/events/domain-events';
import type { AlertCondition } from './alert.domain';
import { evaluateCondition, matches } from './condition-evaluator';

type Case = [
  operator: AlertCondition['operator'],
  value: AlertCondition['value'],
  actual: unknown,
  expected: boolean,
];

function run(type: FieldType, cases: Case[]) {
  it.each(cases)('%s %j against %j → %s', (operator, value, actual, expected) => {
    expect(evaluateCondition({ type }, { operator, value }, actual)).toBe(expected);
  });
}

describe('evaluateCondition', () => {
  describe('string', () => {
    run('string', [
      ['eq', 'main', 'main', true],
      ['eq', 'main', 'Main', false],
      ['eq', 'main', 'develop', false],
      ['neq', 'main', 'develop', true],
      ['neq', 'main', 'main', false],
      ['contains', 'FEAT', 'release/feature-x', true],
      ['contains', 'hotfix', 'release/feature-x', false],
      ['starts_with', 'Release/', 'release/feature-x', true],
      ['starts_with', 'feature', 'release/feature-x', false],
      ['in', ['main', 'develop'], 'develop', true],
      ['in', ['main', 'develop'], 'staging', false],
      ['not_in', ['main', 'develop'], 'staging', true],
      ['not_in', ['main', 'develop'], 'main', false],
      ['contains', 'a', 42, false],
    ]);
  });

  describe('number', () => {
    run('number', [
      ['eq', 3, 3, true],
      ['eq', 3, 4, false],
      ['gt', 0, 1, true],
      ['gt', 0, 0, false],
      ['gte', 0, 0, true],
      ['gte', 1, 0, false],
      ['lt', 5, 4, true],
      ['lt', 5, 5, false],
      ['lte', 5, 5, true],
      ['lte', 5, 6, false],
      // values coming from a form are numeric strings
      ['gt', '2', 3, true],
      ['gt', 'abc', 3, false],
      ['gt', 0, 'not a number', false],
    ]);
  });

  describe('date', () => {
    run('date', [
      ['gt', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', true],
      ['gt', '2026-01-01T00:00:00.000Z', '2025-12-31T23:59:59.000Z', false],
      ['gte', '2026-01-01', '2026-01-01T00:00:00.000Z', true],
      ['lt', '2026-01-01', '2025-06-01', true],
      ['lte', '2026-01-01', '2026-01-02', false],
      ['lt', 'not a date', '2025-06-01', false],
    ]);
  });

  describe('boolean', () => {
    run('boolean', [
      ['is_true', undefined, true, true],
      ['is_true', undefined, false, false],
      ['is_false', undefined, false, true],
      ['is_false', undefined, true, false],
      ['is_true', undefined, 'true', false],
    ]);
  });

  describe('enum and reference', () => {
    run('enum', [
      ['eq', 'trivy', 'trivy', true],
      ['neq', 'trivy', 'grype', true],
      ['in', ['trivy', 'grype'], 'grype', true],
      ['not_in', ['trivy', 'grype'], 'semgrep', true],
    ]);
    run('reference', [
      ['eq', 'svc-1', 'svc-1', true],
      ['eq', 'svc-1', 'svc-2', false],
      ['in', ['svc-1', 'svc-2'], 'svc-2', true],
      ['not_in', ['svc-1'], 'svc-1', false],
    ]);
  });

  describe('list values', () => {
    run('enum', [
      ['in', ['values'], ['key', 'values'], true],
      ['in', ['folder'], ['key', 'values'], false],
      ['not_in', ['folder'], ['key', 'values'], true],
      ['not_in', ['key'], ['key', 'values'], false],
      ['eq', 'key', ['key', 'values'], true],
      ['neq', 'key', ['key', 'values'], false],
    ]);
  });

  describe('absent values', () => {
    const operators: AlertCondition['operator'][] = [
      'eq',
      'neq',
      'in',
      'not_in',
      'contains',
      'starts_with',
      'gt',
      'gte',
      'lt',
      'lte',
      'is_true',
      'is_false',
    ];

    it.each(operators)('%s fails on a missing value', (operator) => {
      expect(evaluateCondition({ type: 'string' }, { operator, value: 'x' }, undefined)).toBe(
        false,
      );
      expect(evaluateCondition({ type: 'string' }, { operator, value: 'x' }, null)).toBe(false);
    });

    it('exists only checks presence', () => {
      expect(evaluateCondition({ type: 'string' }, { operator: 'exists' }, 'x')).toBe(true);
      expect(evaluateCondition({ type: 'number' }, { operator: 'exists' }, 0)).toBe(true);
      expect(evaluateCondition({ type: 'string' }, { operator: 'exists' }, undefined)).toBe(false);
      expect(evaluateCondition({ type: 'string' }, { operator: 'exists' }, null)).toBe(false);
    });
  });
});

describe('matches', () => {
  const definition = getEventDefinition('code_report.analysis.completed') as EventDefinition;

  function completed(overrides: Partial<CodeReportAnalysisCompletedPayload> = {}) {
    const payload: CodeReportAnalysisCompletedPayload = {
      analysisId: 'analysis-1',
      serviceId: 'svc-gateway',
      tool: 'trivy',
      gitInfo: { repositoryUrl: null, branch: 'main', commit: 'abc', version: null },
      summary: { critical: 2, high: 1, medium: 0, low: 0, unknown: 0, total: 3, secrets: 0 },
      policies: {
        status: 'compliant',
        totalViolations: 0,
        blockingFailures: 0,
        failedPolicyIds: [],
      },
      ...overrides,
    };
    return {
      type: 'code_report.analysis.completed' as const,
      payload,
      scope: { organizationId: 'org-1', projectId: 'project-1' },
    };
  }

  const critical: AlertCondition = { field: 'summary.critical', operator: 'gt', value: 0 };
  const gateway: AlertCondition = { field: 'serviceId', operator: 'eq', value: 'svc-gateway' };
  const otherService: AlertCondition = { field: 'serviceId', operator: 'eq', value: 'svc-web' };

  it('always matches without conditions', () => {
    expect(
      matches(completed(), { scope: 'project', match: 'all', conditions: [] }, definition),
    ).toBe(true);
    expect(
      matches(completed(), { scope: 'project', match: 'any', conditions: [] }, definition),
    ).toBe(true);
  });

  it('requires every condition with match all', () => {
    const alert = {
      scope: 'project' as const,
      match: 'all' as const,
      conditions: [gateway, critical],
    };
    expect(matches(completed(), alert, definition)).toBe(true);
    expect(
      matches(
        completed({ summary: { ...completed().payload.summary, critical: 0 } }),
        alert,
        definition,
      ),
    ).toBe(false);
  });

  it('requires any condition with match any', () => {
    const alert = {
      scope: 'project' as const,
      match: 'any' as const,
      conditions: [otherService, critical],
    };
    expect(matches(completed(), alert, definition)).toBe(true);
    expect(matches(completed(), { ...alert, conditions: [otherService] }, definition)).toBe(false);
  });

  it('reads nested paths', () => {
    const alert = {
      scope: 'project' as const,
      match: 'all' as const,
      conditions: [
        { field: 'gitInfo.branch', operator: 'starts_with', value: 'ma' } as AlertCondition,
      ],
    };
    expect(matches(completed(), alert, definition)).toBe(true);
    expect(
      matches(
        completed({ gitInfo: { repositoryUrl: null, branch: null, commit: null, version: null } }),
        alert,
        definition,
      ),
    ).toBe(false);
  });

  it('evaluates derived fields', () => {
    const alert = {
      scope: 'project' as const,
      match: 'all' as const,
      conditions: [{ field: 'policiesViolated', operator: 'is_true' } as AlertCondition],
    };
    expect(matches(completed(), alert, definition)).toBe(false);
    expect(
      matches(
        completed({
          policies: {
            status: 'violated',
            totalViolations: 1,
            blockingFailures: 1,
            failedPolicyIds: ['p'],
          },
        }),
        alert,
        definition,
      ),
    ).toBe(true);
  });

  it('never matches a condition on an unknown field', () => {
    const alert = {
      scope: 'project' as const,
      match: 'any' as const,
      conditions: [{ field: 'nope', operator: 'exists' } as AlertCondition],
    };
    expect(matches(completed(), alert, definition)).toBe(false);
  });

  it('lets an organization alert filter a project event by project', () => {
    const byProject = (value: string[]) => ({
      scope: 'organization' as const,
      match: 'all' as const,
      conditions: [{ field: 'projectId', operator: 'in', value } as AlertCondition],
    });
    expect(matches(completed(), byProject(['project-1']), definition)).toBe(true);
    expect(matches(completed(), byProject(['project-2']), definition)).toBe(false);
    // a project alert has no projectId field to filter by
    expect(
      matches(completed(), { ...byProject(['project-1']), scope: 'project' }, definition),
    ).toBe(false);
  });
});
