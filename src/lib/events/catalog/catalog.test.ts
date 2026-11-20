import { describe, expect, it } from 'vitest';
import es from '#lib/i18n/locales/es.json';
import en from '#lib/i18n/locales/en.json';
import type { CodeReportAnalysisCompletedPayload } from '../domain-events';
import {
  EVENT_CATALOG,
  defineEventCatalog,
  getEventDefinition,
  getFieldValue,
  isEventType,
  listAlertableEvents,
  type EventCatalog,
  type EventDefinition,
  type EventFieldDefinition,
} from './index';

function completedPayload(
  overrides: Partial<CodeReportAnalysisCompletedPayload> = {},
): CodeReportAnalysisCompletedPayload {
  return {
    analysisId: 'analysis-1',
    serviceId: 'service-1',
    tool: 'trivy',
    gitInfo: { repositoryUrl: null, branch: 'main', commit: 'abc', version: null },
    summary: { critical: 2, high: 1, medium: 0, low: 0, unknown: 0, total: 3, secrets: 0 },
    policies: { status: 'compliant', totalViolations: 0, blockingFailures: 0, failedPolicyIds: [] },
    ...overrides,
  };
}

describe('event catalog: compile-time checks', () => {
  it('rejects a field key that is not a path of the payload', () => {
    const valid: EventFieldDefinition<CodeReportAnalysisCompletedPayload> = {
      key: 'gitInfo.branch',
      label: 'x',
      type: 'string',
      operators: ['eq'],
    };
    // @ts-expect-error 'gitInfo.tag' is not a path of the payload (and there is no `derive`)
    const invalid: EventFieldDefinition<CodeReportAnalysisCompletedPayload> = {
      key: 'gitInfo.tag',
      label: 'x',
      type: 'string',
      operators: ['eq'],
    };
    const derived: EventFieldDefinition<CodeReportAnalysisCompletedPayload> = {
      key: 'anything',
      label: 'x',
      type: 'boolean',
      operators: ['is_true'],
      derive: (payload) => payload.summary.total > 0,
    };

    expect([valid.key, invalid.key, derived.key]).toHaveLength(3);
  });

  it('requires a definition for every event of DomainEventMap', () => {
    const incomplete: Partial<EventCatalog> = { ...EVENT_CATALOG };
    delete incomplete['code_report.analysis.failed'];
    // @ts-expect-error 'code_report.analysis.failed' is missing
    const catalog: EventCatalog = incomplete;

    expect(Object.keys(catalog)).not.toContain('code_report.analysis.failed');
  });
});

describe('defineEventCatalog', () => {
  it('rejects an entry whose type does not match its key', () => {
    const completed = EVENT_CATALOG['code_report.analysis.completed'];
    expect(() =>
      defineEventCatalog({
        ...EVENT_CATALOG,
        'code_report.analysis.failed': {
          ...completed,
        } as unknown as EventDefinition<'code_report.analysis.failed'>,
      }),
    ).toThrow(/declares type/);
  });

  it('rejects duplicated field keys', () => {
    const failed = EVENT_CATALOG['code_report.analysis.failed'];
    expect(() =>
      defineEventCatalog({
        ...EVENT_CATALOG,
        'code_report.analysis.failed': { ...failed, fields: [...failed.fields, failed.fields[0]] },
      }),
    ).toThrow(/twice/);
  });
});

describe('catalog helpers', () => {
  it('looks up definitions and event types', () => {
    expect(getEventDefinition('code_report.analysis.completed').readPermission).toBe(
      'project:codereport:reports:read',
    );
    expect(isEventType('code_report.analysis.completed')).toBe(true);
    expect(isEventType('code_report.analysis.unknown')).toBe(false);
    expect(isEventType('toString')).toBe(false);
  });

  it('lists alertable events filtered by scope and module', () => {
    const projectEvents = listAlertableEvents({ scope: 'project', module: 'code_report' });

    expect(projectEvents.map((definition) => definition.type)).toContain(
      'code_report.analysis.completed',
    );
    expect(listAlertableEvents({ scope: 'organization', module: 'code_report' })).toEqual([]);
  });

  it('reads nested payload paths', () => {
    const event = { type: 'code_report.analysis.completed' as const, payload: completedPayload() };

    expect(getFieldValue(event, 'gitInfo.branch')).toBe('main');
    expect(getFieldValue(event, 'summary.critical')).toBe(2);
    expect(getFieldValue(event, 'serviceId')).toBe('service-1');
  });

  it('computes derived fields', () => {
    const clean = completedPayload({
      summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0, secrets: 0 },
    });
    const violated = completedPayload({
      policies: {
        status: 'violated',
        totalViolations: 2,
        blockingFailures: 1,
        failedPolicyIds: ['p'],
      },
    });
    const type = 'code_report.analysis.completed' as const;

    expect(getFieldValue({ type, payload: completedPayload() }, 'hasVulnerabilities')).toBe(true);
    expect(getFieldValue({ type, payload: clean }, 'hasVulnerabilities')).toBe(false);
    expect(getFieldValue({ type, payload: clean }, 'policiesViolated')).toBe(false);
    expect(getFieldValue({ type, payload: violated }, 'policiesViolated')).toBe(true);
  });

  it('returns undefined for unknown fields and missing paths', () => {
    const type = 'code_report.analysis.completed' as const;
    const payload = completedPayload({ gitInfo: null as never });

    expect(getFieldValue({ type, payload }, 'gitInfo.branch')).toBeUndefined();
    // a real payload path that is not exposed in the catalog is not filterable
    expect(getFieldValue({ type, payload }, 'analysisId')).toBeUndefined();
  });
});

describe('catalog translations', () => {
  function lookup(messages: unknown, key: string): unknown {
    // keys may contain dots both as nesting and inside event types / field paths, so walk the
    // object tree trying the longest matching segment first
    if (key === '') return messages;
    if (messages === null || typeof messages !== 'object') return undefined;
    const record = messages as Record<string, unknown>;
    const segments = key.split('.');
    for (let length = segments.length; length > 0; length -= 1) {
      const head = segments.slice(0, length).join('.');
      if (head in record) {
        const found = lookup(record[head], segments.slice(length).join('.'));
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  function catalogKeys(): string[] {
    return (Object.values(EVENT_CATALOG) as EventDefinition[]).flatMap((definition) => [
      definition.label,
      definition.description,
      ...definition.fields.flatMap((field) => [
        field.label,
        ...(field.options ?? []).map((option) => option.label),
      ]),
    ]);
  }

  it.each([
    ['es', es],
    ['en', en],
  ])('has a %s translation for every event, field and option', (_locale, messages) => {
    const missing = catalogKeys().filter((key) => typeof lookup(messages, key) !== 'string');
    expect(missing).toEqual([]);
  });
});
