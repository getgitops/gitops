import { fail, redirect } from '@sveltejs/kit';
import { organizationService } from '#modules/organization';
import { slackAppService } from '#modules/notifications';
import { LINK_PAGE_HEADERS } from '#lib/server/notifications/links';

/**
 * Links the Slack user of `/gitops login` to the GitOps account signed in. Needs a session:
 * `hooks.server.ts` sends signed-out browsers to the login and back here afterwards.
 */
export async function load({ url, locals, setHeaders }) {
  setHeaders(LINK_PAGE_HEADERS);
  if (!locals.user) throw redirect(303, '/auth/login');
  const token = url.searchParams.get('token') ?? '';
  const request = await slackAppService.readLinkRequest(token);
  if (!request) return { token, link: { state: 'invalid' as const } };
  const organization = await organizationService
    .getOrganization(request.workspace.organizationId)
    .catch(() => null);
  return {
    token,
    link: {
      state: 'ready' as const,
      teamName: request.workspace.teamName,
      slackUserName: request.slackUserName,
      organization: organization?.name ?? request.workspace.teamName,
      username: locals.user.username as string,
    },
  };
}

export const actions = {
  async default({ request, locals }) {
    if (!locals.user) throw redirect(303, '/auth/login');
    const form = await request.formData();
    const result = await slackAppService.confirmLink(
      String(form.get('token') ?? ''),
      locals.user.id,
    );
    if (result !== 'linked') return fail(400, { result });
    return { result };
  },
};
