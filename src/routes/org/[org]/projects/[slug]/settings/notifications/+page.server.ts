import { error } from '@sveltejs/kit';
import { projectService } from '#modules/projects';
import { channelActions, loadChannelsSection } from '#lib/server/notifications/channels-page';

/** `/org/<org>/projects/<slug>/settings/notifications`: the project's channels. */
async function projectLocation(params: Record<string, string>) {
  const project = await projectService.getProjectBySlug(params.slug).catch(() => null);
  const organization = project?.organization;
  if (!project || !organization || organization.slug !== params.org) {
    throw error(404, 'Project not found');
  }
  return { scope: 'project' as const, organizationId: organization.id, projectId: project.id };
}

export async function load({ params, locals }) {
  const channels = await loadChannelsSection(locals, await projectLocation(params));
  if (!channels) throw error(403, 'Forbidden');
  return { channels };
}

export const actions = channelActions(({ params }) => projectLocation(params));
