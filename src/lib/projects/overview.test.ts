import { describe, expect, it } from 'vitest';
import { securityScore, serviceHealth, totalSeverity, weightedFindings } from './overview';

const clean = { critical: 0, high: 0, medium: 0, low: 0 };

describe('serviceHealth', () => {
  it('is unscanned until a vulnerability scan completes', () => {
    expect(
      serviceHealth({ scanned: false, severity: clean, exposedSecrets: 3, policyViolated: true }),
    ).toBe('unscanned');
  });

  it('is critical with critical vulnerabilities, exposed secrets or a violated policy', () => {
    const base = { scanned: true, severity: clean, exposedSecrets: 0, policyViolated: false };
    expect(serviceHealth({ ...base, severity: { ...clean, critical: 1 } })).toBe('critical');
    expect(serviceHealth({ ...base, exposedSecrets: 1 })).toBe('critical');
    expect(serviceHealth({ ...base, policyViolated: true })).toBe('critical');
  });

  it('is a warning with only high vulnerabilities, healthy otherwise', () => {
    const base = { scanned: true, exposedSecrets: 0, policyViolated: false };
    expect(serviceHealth({ ...base, severity: { ...clean, high: 2, medium: 9 } })).toBe('warning');
    expect(serviceHealth({ ...base, severity: { ...clean, medium: 4, low: 7 } })).toBe('healthy');
  });
});

describe('securityScore', () => {
  it('is the share of scanned services that pass, ignoring unscanned ones', () => {
    expect(securityScore(['healthy', 'warning', 'critical', 'unscanned'])).toEqual({
      value: 67,
      passing: 2,
      scanned: 3,
    });
  });

  it('is null when nothing has been scanned', () => {
    expect(securityScore(['unscanned', 'unscanned'])).toEqual({
      value: null,
      passing: 0,
      scanned: 0,
    });
    expect(securityScore([]).value).toBeNull();
  });

  it('is 100 when every scanned service passes', () => {
    expect(securityScore(['healthy', 'warning']).value).toBe(100);
  });
});

describe('totals', () => {
  it('adds severities across services', () => {
    expect(
      totalSeverity([
        { severity: { critical: 1, high: 2, medium: 3, low: 4 } },
        { severity: { critical: 0, high: 1, medium: 0, low: 1 } },
      ]),
    ).toEqual({ critical: 1, high: 3, medium: 3, low: 5 });
  });

  it('weights critical findings the most for the trend', () => {
    expect(weightedFindings({ critical: 1, high: 1, medium: 1, low: 1 })).toBe(18);
  });
});
