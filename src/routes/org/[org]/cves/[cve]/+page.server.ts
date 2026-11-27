import { error } from '@sveltejs/kit';
import { cveFeedQueryService } from '#modules/cve-feed';
import {
  buildCveDetail,
  loadCveOccurrences,
  organizationCveProjects,
} from '#lib/server/code-report/cves';
import { advisoryToCveDetail } from '#lib/cves/feed-view';
import { canReadCveFeed, canReadOrganizationProjects } from '#lib/server/cve-feed-access';
import { getTechnology } from '#lib/cves/technologies.data';

export async function load({ parent, locals, params }) {
  const { organization } = await parent();
  const [canFeed, canProjects] = await Promise.all([
    canReadCveFeed(locals.user, organization.id),
    canReadOrganizationProjects(locals.user, organization.id),
  ]);

  // without the feed permission this page behaves as it always did (403 / 404)
  const projects =
    canProjects || !canFeed ? await organizationCveProjects(organization.id, locals.user) : [];
  const advisory = canFeed
    ? await cveFeedQueryService.getAdvisory(organization.id, params.cve, {
        projects: canProjects ? projects : [],
      })
    : null;

  // the scans know the CVE by the id they report; the feed matches by id or alias
  const ids = [
    params.cve,
    ...(advisory ? [advisory.advisory.id, ...advisory.advisory.aliases] : []),
  ];
  const byId = projects.length > 0 ? await loadCveOccurrences(projects) : new Map();
  const occurrences = ids.map((id) => byId.get(id)).find((list) => list?.length);

  if (!occurrences?.length && !advisory) throw error(404, 'CVE not found');

  const feed = advisory
    ? {
        advisory: advisory.advisory,
        affectsMe: advisory.affectsMe,
        occurrences: advisory.occurrences,
        technologies: advisory.technologyIds.map((id) => ({
          id,
          name: getTechnology(id)?.name ?? id,
        })),
      }
    : null;

  if (occurrences?.length) {
    const id = ids.find((candidate) => byId.get(candidate)?.length) ?? params.cve;
    return {
      orgSlug: organization.slug as string,
      scans: true,
      feed,
      ...buildCveDetail(id, occurrences),
    };
  }
  return {
    orgSlug: organization.slug as string,
    scans: false,
    feed,
    cve: advisoryToCveDetail(advisory!.advisory),
    remediations: [],
    affected: [],
  };
}
