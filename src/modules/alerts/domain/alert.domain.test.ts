import { describe, expect, it } from 'vitest';
import { AlertDomain, type AlertRow } from './alert.domain';

const row = (recipients: Record<string, unknown>) =>
  ({
    id: 'a1',
    organizationId: 'org-1',
    projectId: null,
    scope: 'organization',
    name: 'Legacy',
    description: null,
    enabled: true,
    eventType: 'code_report.analysis.completed',
    match: 'all',
    conditions: [],
    recipients,
    channels: ['mail'],
    throttleMinutes: 0,
    createdByUserId: 'u1',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  }) as unknown as AlertRow;

describe('AlertDomain', () => {
  it('reads the external addresses saved by the first version of #99 (`externalEmails`)', () => {
    const alert = new AlertDomain(
      row({ userIds: [], roleIds: [], externalEmails: ['ana@partner.com'] }),
    );
    expect(alert.recipients.emails).toEqual(['ana@partner.com']);
    expect(alert.toJson().recipients).not.toHaveProperty('externalEmails');
  });

  it('merges both fields without duplicates', () => {
    const alert = new AlertDomain(
      row({ emails: ['ana@partner.com'], externalEmails: ['ana@partner.com', 'eva@partner.com'] }),
    );
    expect(alert.recipients.emails).toEqual(['ana@partner.com', 'eva@partner.com']);
  });
});
