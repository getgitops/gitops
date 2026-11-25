import { error } from '@sveltejs/kit';
import { projectService } from '#modules/projects';
import { listStacks } from '#lib/server/state-iac/stacks';

// every stack of the organization's backends, assigned or not (`organization:stateiac:stacks:read`)
export async function load({ parent, locals, params, url }) {
  const { organization } = await parent();
  const result = await listStacks(
    locals,
    { scope: 'organization', organizationId: organization.id },
    { refresh: url.searchParams.get('refresh') === '1' },
  );
  if (!result.ok) throw error(result.status, result.error);
  const projects = await projectService.listProjectsByOrganization(organization.id);
  return {
    groups: result.data.backends,
    base: `/org/${params.org}/state-iac`,
    projectNames: Object.fromEntries(
      projects.map((project: { id: string; name: string }) => [project.id, project.name]),
    ) as Record<string, string>,
    settingsHref: `/org/${params.org}/settings/state-iac`,
  };
}
