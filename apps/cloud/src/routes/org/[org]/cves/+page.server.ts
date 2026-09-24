import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { codeReportCveService } from '$modules/code-report';
import { projectService } from '$modules/projects';
import { summarizeCves } from '$lib/code-report/cve-aggregation';

export async function load({ parent, locals, url }) {
  const { organization } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'organization:projects:read', {
    scope: 'organization',
    organizationId: organization.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const projects = (await projectService.listProjectsByOrganization(organization.id)).filter(
    (project) => project.status === 'active' && project.modules?.codereport,
  );

  const occurrencesByCve = await codeReportCveService.getOrganizationCveOccurrences(
    projects.map((project) => ({
      id: project.id,
      slug: project.slug ?? '',
      name: project.name,
    })),
  );

  const cves = summarizeCves(
    new Map([...occurrencesByCve.entries()].map(([id, occurrences]) => [id, occurrences])),
  ).map((cve) => ({
    ...cve,
    projectSlugs: [
      ...new Set((occurrencesByCve.get(cve.id) ?? []).map((entry) => entry.projectSlug)),
    ],
  }));

  return {
    orgSlug: organization.slug,
    cves,
    projects: projects.map((project) => ({ slug: project.slug, name: project.name })),
    initialProjectFilter: url.searchParams.get('project') ?? 'all',
  };
}
