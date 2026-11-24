import {
  buildCveList,
  loadCveOccurrences,
  organizationCveProjects,
} from '#lib/server/code-report/cves';

export async function load({ parent, locals, url }) {
  const { organization } = await parent();
  const projects = await organizationCveProjects(organization.id, locals.user);
  const occurrences = await loadCveOccurrences(projects);

  return {
    orgSlug: organization.slug as string,
    cves: buildCveList(occurrences),
    projects: projects.map(({ slug, name }) => ({ slug, name })),
    initialProject: url.searchParams.get('project') ?? 'all',
  };
}
