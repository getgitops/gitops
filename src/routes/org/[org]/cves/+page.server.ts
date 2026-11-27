import { error, fail } from '@sveltejs/kit';
import {
  CveWatchlistValidationError,
  cveFeedQueryService,
  cveFeedRuntime,
  cveWatchlistService,
  getCveFeedConfig,
  isCveFeedEnabled,
} from '#modules/cve-feed';
import { organizationService } from '#modules/organization';
import {
  buildCveList,
  loadCveOccurrences,
  organizationCveProjects,
} from '#lib/server/code-report/cves';
import {
  FEED_PAGE_SIZE,
  parseCvesTab,
  parseFeedFilters,
  parseWatchlistForm,
} from '#lib/cves/feed-view';
import {
  canReadCveFeed,
  canReadOrganizationProjects,
  canUpdateCveFeed,
} from '#lib/server/cve-feed-access';

export async function load({ parent, locals, url }) {
  const { organization } = await parent();
  const [canFeed, canProjects] = await Promise.all([
    canReadCveFeed(locals.user, organization.id),
    canReadOrganizationProjects(locals.user, organization.id),
  ]);
  const tab = parseCvesTab(url.searchParams, { feed: canFeed, projects: canProjects });
  const base = { orgSlug: organization.slug as string, tab, canFeed };

  if (tab === 'technology') {
    const { filters, values } = parseFeedFilters(url.searchParams);
    const [canUpdate, view, status, suggestions] = await Promise.all([
      canUpdateCveFeed(locals.user, organization.id),
      cveFeedQueryService.getView(organization.id),
      cveFeedQueryService.status(),
      cveWatchlistService.suggestions(organization.id),
    ]);
    const page = await cveFeedQueryService.list(organization.id, {
      ...filters,
      limit: FEED_PAGE_SIZE,
      offset: (values.page - 1) * FEED_PAGE_SIZE,
    });
    return {
      ...base,
      feed: {
        enabled: isCveFeedEnabled(),
        canUpdate,
        severityFloor: getCveFeedConfig().minSeverity,
        watchlist: view.watchlist,
        technologies: view.technologies,
        items: page.items,
        total: page.total,
        pageSize: FEED_PAGE_SIZE,
        filters: values,
        status,
        suggestions,
        manage: url.searchParams.get('manage') === '1',
      },
    };
  }

  // "Mis CVEs": exactly the scan view; no feed data is loaded here
  const projects = await organizationCveProjects(organization.id, locals.user);
  const occurrences = await loadCveOccurrences(projects);
  return {
    ...base,
    cves: buildCveList(occurrences),
    projects: projects.map(({ slug, name }) => ({ slug, name })),
    initialProject: url.searchParams.get('project') ?? 'all',
  };
}

export const actions = {
  /** Replaces the watchlist (technologies, minimum severity, KEV). Works without JavaScript. */
  async watchlist({ request, locals, params }) {
    const organization = await organizationService.tryFindBySlug(params.org);
    if (!organization) throw error(404, 'Organization not found');
    if (!locals.user || !(await canUpdateCveFeed(locals.user, organization.id))) {
      return fail(403, { action: 'watchlist', error: 'forbidden' });
    }

    const current = await cveWatchlistService.get(organization.id);
    const input = parseWatchlistForm(
      await request.formData(),
      current,
      getCveFeedConfig().minSeverity,
    );
    try {
      await cveWatchlistService.update(organization.id, input, locals.user.id);
    } catch (err) {
      if (err instanceof CveWatchlistValidationError) {
        return fail(400, { action: 'watchlist', error: err.code, message: err.message });
      }
      throw err;
    }
    return { action: 'watchlist', success: true };
  },

  /** Asks the worker for a sync soon. It never calls a source from the request. */
  async sync({ locals, params }) {
    const organization = await organizationService.tryFindBySlug(params.org);
    if (!organization) throw error(404, 'Organization not found');
    if (!locals.user || !(await canUpdateCveFeed(locals.user, organization.id))) {
      return fail(403, { action: 'sync', error: 'forbidden' });
    }
    if (!isCveFeedEnabled()) return fail(409, { action: 'sync', error: 'disabled' });
    await cveFeedRuntime.requestSync();
    return { action: 'sync', success: true };
  },
};
