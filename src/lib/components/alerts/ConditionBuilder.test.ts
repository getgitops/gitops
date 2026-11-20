import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { CatalogEntry } from '#lib/alerts/types';

// `#lib/i18n` reads `$app/env`, which only exists inside SvelteKit
vi.mock('$app/env', () => ({ browser: false }));

const { default: ConditionBuilder } = await import('./ConditionBuilder.svelte');

/** A made-up event: nothing in the component knows about it. */
const definition: CatalogEntry = {
  type: 'code_report.analysis.completed',
  module: 'code_report',
  scope: 'project',
  label: 'events.code_report.analysis.completed.label',
  description: 'events.code_report.analysis.completed.description',
  readPermission: 'project:codereport:reports:read',
  alertable: true,
  fields: [
    { key: 'branch', label: 'test.fields.branch', type: 'string', operators: ['eq', 'contains'] },
    { key: 'count', label: 'test.fields.count', type: 'number', operators: ['gt', 'lte'] },
    { key: 'when', label: 'test.fields.when', type: 'date', operators: ['gt'] },
    { key: 'flag', label: 'test.fields.flag', type: 'boolean', operators: ['is_true', 'is_false'] },
    {
      key: 'tool',
      label: 'test.fields.tool',
      type: 'enum',
      operators: ['eq', 'in'],
      options: [
        { value: 'trivy', label: 'test.options.trivy' },
        { value: 'grype', label: 'test.options.grype' },
      ],
    },
    {
      key: 'serviceId',
      label: 'test.fields.service',
      type: 'reference',
      reference: 'code_report_service',
      operators: ['eq', 'in'],
    },
  ],
};

const referenceOptions = {
  code_report_service: [
    { id: 'svc-1', label: 'api-gateway' },
    { id: 'svc-2', label: 'web' },
  ],
};

function html(conditions: Array<{ field: string; operator: string; value: string | string[] }>) {
  return render(ConditionBuilder, {
    props: {
      definition,
      conditions: conditions as never,
      match: 'all',
      referenceOptions,
      errors: { 'conditions.1.value': 'invalid' },
    },
  }).body;
}

describe('ConditionBuilder', () => {
  it('offers every catalog field of the event, and only its operators', () => {
    const body = html([{ field: 'branch', operator: 'eq', value: 'main' }]);

    for (const field of definition.fields) {
      expect(body).toContain(`value="${field.key}"`);
    }
    expect(body).toContain('name="conditions.0.field"');
    // operators of `branch` only
    expect(body).toContain('value="contains"');
    expect(body).not.toContain('value="gt"');
  });

  it('renders the input that matches each field type', () => {
    const body = html([
      { field: 'branch', operator: 'eq', value: 'main' },
      { field: 'count', operator: 'gt', value: '0' },
      { field: 'when', operator: 'gt', value: '2026-01-01T00:00:00.000Z' },
      { field: 'flag', operator: 'is_true', value: '' },
      { field: 'tool', operator: 'in', value: ['trivy'] },
      { field: 'serviceId', operator: 'eq', value: 'svc-2' },
    ]);
    const rows = body.split('data-testid="condition-row"').slice(1);

    expect(rows[0]).toMatch(/type="text"[^>]*name="conditions\.0\.value"/);
    expect(rows[1]).toMatch(/type="number"/);
    expect(rows[2]).toMatch(/type="date"/);
    expect(rows[2]).toContain('value="2026-01-01"');
    // booleans take no value
    expect(rows[3]).toContain('data-input="none"');
    expect(rows[3]).not.toContain('name="conditions.3.value"');
    // enum + `in`: multiple choice with the catalog options
    expect(rows[4]).toMatch(/type="checkbox"[^>]*name="conditions\.4\.value"[^>]*value="trivy"/);
    expect(rows[4]).toContain('value="grype"');
    expect(rows[4]).toContain('name="conditions.4.multiple" value="true"');
    // reference + `eq`: single choice among the entities of the scope
    expect(rows[5]).toMatch(/type="radio"[^>]*name="conditions\.5\.value"[^>]*value="svc-2"/);
    expect(rows[5]).toContain('api-gateway');
  });

  it('links server errors to their input', () => {
    const body = html([
      { field: 'branch', operator: 'eq', value: 'main' },
      { field: 'count', operator: 'gt', value: 'x' },
    ]);
    expect(body).toContain('id="condition-1-value-error"');
    expect(body).toMatch(/aria-describedby="condition-1-value-error"/);
  });

  it('shows a new catalog field without touching the component', () => {
    const extended: CatalogEntry = {
      ...definition,
      fields: [
        ...definition.fields,
        {
          key: 'summary.secrets',
          label: 'test.fields.secrets',
          type: 'number',
          operators: ['gte'],
        },
      ],
    };
    const body = render(ConditionBuilder, {
      props: {
        definition: extended,
        conditions: [{ field: 'summary.secrets', operator: 'gte', value: '1' }],
        match: 'any',
        referenceOptions,
      },
    }).body;

    expect(body).toContain('value="summary.secrets"');
    expect(body).toContain('value="gte"');
    expect(body).toMatch(/type="number"[^>]*name="conditions\.0\.value"/);
  });
});
