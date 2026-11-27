import { describe, expect, it } from 'vitest';
import {
  advisoryToCveDetail,
  feedQuery,
  parseCvesTab,
  parseFeedFilters,
  parseWatchlistForm,
  severityAtLeast,
} from './feed-view';

const params = (query: string) => new URLSearchParams(query);

describe('parseFeedFilters', () => {
  it('reads valid filters and builds the query service filters', () => {
    const { filters, values } = parseFeedFilters(
      params(
        'technology=nodejs&severity=high&kev=1&affectsMe=1&from=2026-01-02&to=2026-02-03&page=3',
      ),
    );
    expect(filters).toEqual({
      technologyId: 'nodejs',
      minSeverity: 'high',
      kev: true,
      affectsMe: true,
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-02-03T23:59:59.999Z',
    });
    expect(values.page).toBe(3);
  });

  it('ignores anything invalid instead of failing', () => {
    const { filters, values } = parseFeedFilters(
      params('severity=extreme&kev=yes&from=yesterday&to=2026-13-40&page=-4'),
    );
    expect(filters).toEqual({});
    expect(values).toMatchObject({ severity: '', kev: false, from: '', to: '', page: 1 });
  });

  it('swaps an inverted date range and never accepts "unknown" as a threshold', () => {
    const { values } = parseFeedFilters(params('from=2026-05-01&to=2026-04-01&severity=unknown'));
    expect(values).toMatchObject({ from: '2026-04-01', to: '2026-05-01', severity: '' });
  });
});

describe('feedQuery', () => {
  it('keeps the tab and only the values that are set', () => {
    expect(feedQuery({ technology: 'redis', kev: true, page: 1 })).toBe(
      '?tab=technology&technology=redis&kev=1',
    );
    expect(feedQuery({ page: 2 }, { manage: '1' })).toBe('?tab=technology&page=2&manage=1');
  });
});

describe('parseCvesTab', () => {
  it('defaults to "mine" and hides the feed tab without permission', () => {
    expect(parseCvesTab(params(''), { feed: true, projects: true })).toBe('mine');
    expect(parseCvesTab(params('tab=technology'), { feed: true, projects: true })).toBe(
      'technology',
    );
    expect(parseCvesTab(params('tab=technology'), { feed: false, projects: true })).toBe('mine');
  });

  it('sends someone who can only read the feed to the feed', () => {
    expect(parseCvesTab(params(''), { feed: true, projects: false })).toBe('technology');
  });
});

describe('parseWatchlistForm', () => {
  const current = {
    technologies: [
      {
        technologyId: 'custom:osv:npm:left-pad',
        custom: { kind: 'osv' as const, ecosystem: 'npm' as const, package: 'left-pad' },
        label: 'Left pad',
        addedAt: '2026-01-01T00:00:00Z',
      },
      { technologyId: 'redis', minSeverity: 'critical' as const, addedAt: '2026-01-01T00:00:00Z' },
    ],
  };

  function form(entries: [string, string][]) {
    const data = new FormData();
    for (const [key, value] of entries) data.append(key, value);
    return data;
  }

  it('collects catalog ids, kept custom entries and a new custom entry', () => {
    const input = parseWatchlistForm(
      form([
        ['technology', 'redis'],
        ['technology', 'nodejs'],
        ['custom', 'osv:npm:left-pad'],
        ['newKind', 'cpe'],
        ['newEcosystem', 'npm'],
        ['newValue', ' cpe:2.3:a:acme:widget '],
        ['minSeverity', 'critical'],
        ['includeKev', 'on'],
      ]),
      current,
      'high',
    );
    expect(input.technologies).toEqual(
      [
        { technologyId: 'redis', label: undefined, minSeverity: 'critical', versions: undefined },
        { technologyId: 'nodejs' },
        { custom: { kind: 'osv', ecosystem: 'npm', package: 'left-pad' }, label: 'Left pad' },
        { custom: { kind: 'cpe', cpe: 'cpe:2.3:a:acme:widget' } },
      ].map((entry) => expect.objectContaining(entry)),
    );
    expect(input).toMatchObject({ minSeverity: 'critical', includeKev: true });
  });

  it('adds an OSV package with the chosen ecosystem, and keeps colons in the package name', () => {
    const input = parseWatchlistForm(
      form([
        ['custom', 'osv:Maven:org.apache:thing'],
        ['newKind', 'osv'],
        ['newEcosystem', 'PyPI'],
        ['newValue', 'requests'],
      ]),
      { technologies: [] },
      'high',
    );
    expect(input.technologies).toEqual([
      { custom: { kind: 'osv', ecosystem: 'Maven', package: 'org.apache:thing' } },
      { custom: { kind: 'osv', ecosystem: 'PyPI', package: 'requests' } },
    ]);
  });

  it('lifts a minimum severity below the global floor and unchecks KEV when absent', () => {
    const input = parseWatchlistForm(form([['minSeverity', 'low']]), { technologies: [] }, 'high');
    expect(input).toEqual({ technologies: [], minSeverity: 'high', includeKev: false });
  });
});

describe('severityAtLeast', () => {
  it('returns the higher of both', () => {
    expect(severityAtLeast('low', 'high')).toBe('high');
    expect(severityAtLeast('critical', 'high')).toBe('critical');
  });
});

describe('advisoryToCveDetail', () => {
  it('links NVD for CVE ids and OSV otherwise', () => {
    const base = {
      id: 'CVE-2026-1',
      aliases: [],
      title: 't',
      summary: 's',
      details: '',
      severity: 'high',
      cvssScore: 8,
      cwe: [],
      references: ['https://x.test'],
      epssScore: null,
      epssPercentile: null,
      publishedAt: null,
      modifiedAt: '2026-01-01T00:00:00Z',
    } as unknown as Parameters<typeof advisoryToCveDetail>[0];
    expect(advisoryToCveDetail(base)).toMatchObject({
      description: 's',
      cveUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1',
      primaryUrl: 'https://osv.dev/vulnerability/CVE-2026-1',
    });
    expect(advisoryToCveDetail({ ...base, id: 'GHSA-abcd' }).cveUrl).toBe(
      'https://osv.dev/vulnerability/GHSA-abcd',
    );
  });
});
