import { error } from '@sveltejs/kit';
import {
  buildCveDetail,
  loadCveOccurrences,
  requireProjectCveAccess,
} from '#lib/server/code-report/cves';

export async function load({ parent, locals, params }) {
  const { project } = await parent();
  await requireProjectCveAccess(project, locals.user);

  const occurrences = (
    await loadCveOccurrences([{ id: project.id, slug: project.slug ?? '', name: project.name }])
  ).get(params.cve);
  if (!occurrences?.length) throw error(404, 'CVE not found');

  return buildCveDetail(params.cve, occurrences);
}
