/**
 * Pure helpers of the CVE feed pages (`/org/<org>/cves` technology tab and the detail page):
 * GET filters, the watchlist form and the mapping of an advisory to the shared CVE detail view.
 * No server imports, so the routes and their tests can use it as is.
 */
import { OSV_ECOSYSTEMS, type OsvEcosystem } from '#lib/cves/technologies.data';
import type { CveDetail } from '#lib/components/code-report/CveDetailView.svelte';
import type {
  CveAdvisory,
  CveFeedFilters,
  CveWatchlist,
  Severity,
  WatchlistEntryInput,
  WatchlistInput,
} from '#modules/cve-feed';

export const FEED_PAGE_SIZE = 25;
/** Severities a user can pick as a minimum (`unknown` is never a useful threshold). */
export const SELECTABLE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const RANK: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FeedFilterValues = {
  technology: string;
  severity: string;
  kev: boolean;
  affectsMe: boolean;
  from: string;
  to: string;
  page: number;
};

export type ParsedFeedFilters = {
  /** What goes to the query service (without paging). */
  filters: CveFeedFilters;
  /** The normalized values, to fill the form back in. */
  values: FeedFilterValues;
};

function validDate(value: string | null): string {
  if (!value || !DATE_PATTERN.test(value)) return '';
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? '' : value;
}

/** Reads the GET filters of the technology tab; anything invalid is ignored, never an error. */
export function parseFeedFilters(params: URLSearchParams): ParsedFeedFilters {
  const technology = (params.get('technology') ?? '').trim().slice(0, 200);
  const severityParam = params.get('severity') ?? '';
  const severity = (SELECTABLE_SEVERITIES as readonly string[]).includes(severityParam)
    ? severityParam
    : '';
  const kev = params.get('kev') === '1';
  const affectsMe = params.get('affectsMe') === '1';
  let from = validDate(params.get('from'));
  let to = validDate(params.get('to'));
  if (from && to && from > to) [from, to] = [to, from];
  const pageNumber = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 10_000) : 1;

  const filters: CveFeedFilters = {};
  if (technology) filters.technologyId = technology;
  if (severity) filters.minSeverity = severity as Severity;
  if (kev) filters.kev = true;
  if (affectsMe) filters.affectsMe = true;
  if (from) filters.from = `${from}T00:00:00.000Z`;
  if (to) filters.to = `${to}T23:59:59.999Z`;
  return { filters, values: { technology, severity, kev, affectsMe, from, to, page } };
}

/** Query string of the technology tab (only what is set), optionally overriding some values. */
export function feedQuery(
  values: Partial<FeedFilterValues>,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({ tab: 'technology' });
  if (values.technology) params.set('technology', values.technology);
  if (values.severity) params.set('severity', values.severity);
  if (values.kev) params.set('kev', '1');
  if (values.affectsMe) params.set('affectsMe', '1');
  if (values.from) params.set('from', values.from);
  if (values.to) params.set('to', values.to);
  if (values.page && values.page > 1) params.set('page', String(values.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `?${params.toString()}`;
}

/** `?tab=` of the cves page; the feed tab needs the feed permission. */
export function parseCvesTab(
  params: URLSearchParams,
  access: { feed: boolean; projects: boolean },
): 'mine' | 'technology' {
  const wanted = params.get('tab') === 'technology' ? 'technology' : 'mine';
  if (wanted === 'technology' && !access.feed) return 'mine';
  // someone who can only read the feed has nothing to see in "Mis CVEs"
  if (wanted === 'mine' && !access.projects && access.feed) return 'technology';
  return wanted;
}

export function severityAtLeast(value: string, floor: string): string {
  return (RANK[value] ?? 0) >= (RANK[floor] ?? 0) ? value : floor;
}

function customValue(value: string): WatchlistEntryInput['custom'] | null {
  if (value.startsWith('osv:')) {
    const rest = value.slice(4);
    const index = rest.indexOf(':');
    if (index < 1) return null;
    return {
      kind: 'osv',
      ecosystem: rest.slice(0, index) as OsvEcosystem,
      package: rest.slice(index + 1),
    };
  }
  if (value.startsWith('cpe:')) return { kind: 'cpe', cpe: value.slice(4) };
  return null;
}

/** The value of the `custom` checkbox that keeps an existing custom entry. */
export function customFieldValue(custom: NonNullable<WatchlistEntryInput['custom']>): string {
  return custom.kind === 'osv' ? `osv:${custom.ecosystem}:${custom.package}` : `cpe:${custom.cpe}`;
}

/**
 * Builds the watchlist the form describes. Fields: `technology` (catalog ids, repeated), `custom`
 * (custom entries kept, `osv:<ecosystem>:<package>` or `cpe:<cpe>`), `newKind`/`newEcosystem`/
 * `newValue` (a custom entry to add), `minSeverity` and `includeKev`. Entries that were already
 * followed keep their label, own severity and versions. `severityFloor` is the global
 * CVE_FEED_MIN_SEVERITY: the organization can only raise it, so a lower choice is lifted to it.
 */
export function parseWatchlistForm(
  form: FormData,
  current: Pick<CveWatchlist, 'technologies'>,
  severityFloor: string,
): WatchlistInput {
  const before = new Map(current.technologies.map((entry) => [entry.technologyId, entry]));
  const keep = (id: string): Partial<WatchlistEntryInput> => {
    const entry = before.get(id);
    return entry
      ? { label: entry.label, minSeverity: entry.minSeverity, versions: entry.versions }
      : {};
  };

  const technologies: WatchlistEntryInput[] = [];
  for (const id of form.getAll('technology')) {
    if (typeof id === 'string' && id) technologies.push({ technologyId: id, ...keep(id) });
  }
  for (const value of form.getAll('custom')) {
    const custom = typeof value === 'string' ? customValue(value) : null;
    if (!custom) continue;
    const existing = [...before.values()].find(
      (entry) => entry.custom && customFieldValue(entry.custom) === value,
    );
    technologies.push({
      custom,
      ...(existing ? keep(existing.technologyId) : {}),
    });
  }

  const newValue = String(form.get('newValue') ?? '').trim();
  if (newValue) {
    const kind = form.get('newKind') === 'cpe' ? 'cpe' : 'osv';
    if (kind === 'cpe') technologies.push({ custom: { kind: 'cpe', cpe: newValue } });
    else {
      const ecosystem = String(form.get('newEcosystem') ?? '');
      technologies.push({
        // an unknown ecosystem reaches the validator, which rejects it with a clear error
        custom: { kind: 'osv', ecosystem: ecosystem as OsvEcosystem, package: newValue },
      });
    }
  }

  return {
    technologies,
    minSeverity: severityAtLeast(String(form.get('minSeverity') ?? severityFloor), severityFloor),
    includeKev: form.get('includeKev') === 'on',
  };
}

export const KNOWN_ECOSYSTEMS: readonly string[] = OSV_ECOSYSTEMS;

export function nvdUrl(id: string): string | null {
  return /^CVE-\d{4}-\d+$/i.test(id)
    ? `https://nvd.nist.gov/vuln/detail/${id.toUpperCase()}`
    : null;
}

export function osvUrl(advisory: Pick<CveAdvisory, 'id' | 'aliases'>): string {
  return `https://osv.dev/vulnerability/${encodeURIComponent(advisory.id)}`;
}

export const KEV_CATALOG_URL = 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog';

/** The shared detail view's data, built from a feed advisory (when the scans know nothing of it). */
export function advisoryToCveDetail(advisory: CveAdvisory): CveDetail {
  const nvd = nvdUrl(advisory.id);
  return {
    id: advisory.id,
    title: advisory.title,
    description: advisory.details || advisory.summary,
    severity: advisory.severity,
    cvssScore: advisory.cvssScore,
    epssScore: advisory.epssScore,
    epssPercentile: advisory.epssPercentile,
    primaryUrl: osvUrl(advisory),
    cveUrl: nvd ?? osvUrl(advisory),
    cweIds: advisory.cwe,
    references: advisory.references,
    publishedDate: advisory.publishedAt,
    lastModifiedDate: advisory.modifiedAt,
  };
}
