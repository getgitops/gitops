import {
  buildCveList,
  loadCveOccurrences,
  requireProjectCveAccess,
} from '#lib/server/code-report/cves';

export async function load({ parent, locals }) {
  const { project } = await parent();
  await requireProjectCveAccess(project, locals.user);

  const occurrences = await loadCveOccurrences([
    { id: project.id, slug: project.slug ?? '', name: project.name },
  ]);
  return { cves: buildCveList(occurrences) };
}
