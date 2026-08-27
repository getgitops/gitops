import { fail } from '@sveltejs/kit';
import { auditService } from '$modules/audit';

export async function load({ parent }) {
  const { organization } = await parent();
  const { events } = await auditService.listEvents({ organizationId: organization.id });
  return { events, commitBaseUrl: auditService.getRepositoryWebUrl() };
}

export const actions = {
  async viewDiff({ request }) {
    const form = await request.formData();
    const commit = String(form.get('commit') ?? '');
    const entity = String(form.get('entity') ?? '');

    if (!commit || !entity) {
      return fail(400, { error: 'commit and entity are required.' });
    }

    try {
      const changes = await auditService.getEntityDiff(commit, entity);
      return { success: true, changes };
    } catch (error: unknown) {
      return fail(500, { error: error instanceof Error ? error.message : 'Failed to load changes.' });
    }
  },
};
