import { describe, expect, it } from 'vitest';
import {
  formatProjectNotificationFilter,
  matchesProjectNotificationFilters,
} from './project-notification-filter';

describe('project notification filters', () => {
  it('matches all conditions case-insensitively', () => {
    expect(
      matchesProjectNotificationFilters({ roleSlug: 'Admin', origin: 'assigned' }, [
        { field: 'roleSlug', operator: 'equals', value: 'admin' },
        { field: 'origin', operator: 'not_equals', value: 'invited' },
      ]),
    ).toBe(true);
  });

  it('formats conditions as a readable JQL-style expression', () => {
    expect(
      formatProjectNotificationFilter([
        { field: 'roleSlug', operator: 'equals', value: 'admin' },
        { field: 'origin', operator: 'exists', value: '' },
      ]),
    ).toBe('roleSlug = "admin" AND origin IS NOT EMPTY');
  });

  it('compares severity counts numerically', () => {
    expect(
      matchesProjectNotificationFilters({ summary: { vulnerabilities: { critical: 2 } } }, [
        {
          field: 'summary.vulnerabilities.critical',
          operator: 'greater_than',
          value: '0',
        },
      ]),
    ).toBe(true);
  });

  it('compares expiration dates and rejects missing expiration values', () => {
    const filter = [{ field: 'expiresAt', operator: 'less_than' as const, value: '2027-01-01' }];

    expect(matchesProjectNotificationFilters({ expiresAt: '2026-12-01T00:00:00Z' }, filter)).toBe(
      true,
    );
    expect(matchesProjectNotificationFilters({ expiresAt: null }, filter)).toBe(false);
  });
});
