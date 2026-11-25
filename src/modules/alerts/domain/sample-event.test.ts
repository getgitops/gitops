import { describe, expect, it } from 'vitest';
import { getEventDefinition, type EventDefinition } from '#lib/events/catalog';
import { buildSampleEvent } from './sample-event';

const analysis = getEventDefinition('code_report.analysis.completed') as EventDefinition;

describe('buildSampleEvent', () => {
  it('only sets what the conditions need for a dry run', () => {
    const sample = buildSampleEvent(analysis, {
      scope: 'project',
      conditions: [{ field: 'summary.critical', operator: 'gt', value: 0 }],
    });
    expect(sample.payload).toEqual({ summary: { critical: 1 } });
  });

  it('builds a complete payload for test emails, conditions still winning', () => {
    const sample = buildSampleEvent(
      analysis,
      {
        scope: 'project',
        conditions: [{ field: 'summary.critical', operator: 'gt', value: 5 }],
      },
      { complete: true },
    );

    expect(sample.payload).toMatchObject({
      analysisId: 'sample-analysis',
      gitInfo: { branch: 'main' },
      summary: { critical: 6, high: 2, total: 10 },
      policies: { status: 'compliant' },
    });
    // enum fields get their first option; references are never invented
    expect(typeof sample.payload.tool).toBe('string');
    expect(sample.payload).not.toHaveProperty('serviceId');
  });

  it('fills typed placeholders for events without a sample payload', () => {
    const definition = getEventDefinition('vault.secret.deleted') as EventDefinition;
    const sample = buildSampleEvent(
      definition,
      { scope: 'project', conditions: [] },
      { complete: true },
    );
    expect(sample.payload).toMatchObject({ key: 'example', folderPath: 'example' });
  });
});
