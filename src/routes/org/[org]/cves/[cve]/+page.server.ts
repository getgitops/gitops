import { error } from '@sveltejs/kit';
import {
  buildCveDetail,
  loadCveOccurrences,
  organizationCveProjects,
} from '#lib/server/code-report/cves';

export async function load({ parent, locals, params }) {
  const { organization } = await parent();
  const projects = await organizationCveProjects(organization.id, locals.user);

  const occurrences = (await loadCveOccurrences(projects)).get(params.cve);
  if (!occurrences?.length) throw error(404, 'CVE not found');

  return { orgSlug: organization.slug as string, ...buildCveDetail(params.cve, occurrences) };
}
