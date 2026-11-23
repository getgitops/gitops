import { describe, expect, it } from 'vitest';
import { summarizeConditions, summarizeRecipients } from './summary';
import type { CatalogEntry } from './types';

const labels: Record<string, string> = {
  'f.service': 'Servicio',
  'f.critical': 'Vulnerabilidades críticas',
  'f.tool': 'Herramienta',
  'f.flag': 'Hay vulnerabilidades',
  'o.trivy': 'Trivy',
  'alerts.operators.eq': 'es',
  'alerts.operators.gt': 'mayor que',
  'alerts.operators.in': 'es uno de',
  'alerts.operators.is_true': 'es sí',
  'alerts.summary.and': 'y',
  'alerts.summary.or': 'o',
  'alerts.summary.always': 'Siempre',
  'alerts.summary.noRecipients': 'Nadie',
};
const t = (key: string) => labels[key] ?? key;

const definition = {
  type: 'code_report.analysis.completed',
  fields: [
    {
      key: 'serviceId',
      label: 'f.service',
      type: 'reference',
      reference: 'code_report_service',
      operators: ['eq', 'in'],
    },
    { key: 'summary.critical', label: 'f.critical', type: 'number', operators: ['gt'] },
    {
      key: 'tool',
      label: 'f.tool',
      type: 'enum',
      options: [{ value: 'trivy', label: 'o.trivy' }],
      operators: ['in'],
    },
    {
      key: 'hasVulnerabilities',
      label: 'f.flag',
      type: 'boolean',
      operators: ['is_true'],
      derived: true,
    },
  ],
} as unknown as CatalogEntry;

const references = { code_report_service: [{ id: 'svc-1', label: 'api-gateway' }] };

describe('summarizeConditions', () => {
  it('reads like the guided example', () => {
    expect(
      summarizeConditions(
        definition,
        [
          { field: 'serviceId', operator: 'eq', value: 'svc-1' },
          { field: 'summary.critical', operator: 'gt', value: 0 },
        ],
        'all',
        references,
        t,
      ),
    ).toBe('Servicio es api-gateway y Vulnerabilidades críticas mayor que 0');
  });

  it('joins with "or", lists values and skips valueless operators', () => {
    expect(
      summarizeConditions(
        definition,
        [
          { field: 'tool', operator: 'in', value: ['trivy', 'grype'] },
          { field: 'hasVulnerabilities', operator: 'is_true', value: '' },
        ],
        'any',
        references,
        t,
      ),
    ).toBe('Herramienta es uno de Trivy, grype o Hay vulnerabilidades es sí');
  });

  it('says when an alert has no conditions and keeps unknown fields raw', () => {
    expect(summarizeConditions(definition, [], 'all', references, t)).toBe('Siempre');
    expect(
      summarizeConditions(
        definition,
        [{ field: 'gone', operator: 'eq', value: 'x' }],
        'all',
        references,
        t,
      ),
    ).toBe('gone es');
  });
});

describe('summarizeRecipients', () => {
  it('names roles and users', () => {
    expect(
      summarizeRecipients(
        { userIds: ['u1', 'ghost'], roleIds: ['r1'] },
        [{ id: 'u1', label: 'ana' }],
        [{ id: 'r1', label: 'Project Admin' }],
        t,
      ),
    ).toBe('Project Admin, ana, ghost');
    expect(summarizeRecipients({ userIds: [], roleIds: [] }, [], [], t)).toBe('Nadie');
  });
});
