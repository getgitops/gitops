import { describe, expect, it } from 'vitest';
import { getChangelogEntry, shouldShowWhatsNew } from './changelog';

describe('changelog', () => {
  it('has an entry for the installed package version', async () => {
    const { version } = (await import('../../package.json')).default;
    expect(getChangelogEntry(version)?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the entry matching the installed package version', () => {
    expect(getChangelogEntry('1.3.6')?.es.title).toBe(
      'Alertas, eventos y nuevas opciones de acceso',
    );
  });

  it('does not show Whats New until the version changes', () => {
    expect(shouldShowWhatsNew('1.3.6', null)).toBe(true);
    expect(shouldShowWhatsNew('1.3.6', '1.3.6')).toBe(false);
  });

  it('does not show for a package version without an entry', () => {
    expect(shouldShowWhatsNew('0.0.1', null)).toBe(false);
  });
});
