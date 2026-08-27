import { fail } from '@sveltejs/kit';
import { auditService } from '$modules/audit';

export async function load({ parent, url }) {
  const { organization } = await parent();
  const { events, page, perPage, total, totalPages } = await auditService.listEvents({
    organizationId: organization.id,
    search: url.searchParams.get('search') || undefined,
    dateFrom: url.searchParams.get('from') || undefined,
    dateTo: url.searchParams.get('to') || undefined,
    page: Number(url.searchParams.get('page')) || undefined,
    perPage: Number(url.searchParams.get('perPage')) || undefined,
  });

  return {
    events,
    pagination: { page, perPage, total, totalPages },
    commitBaseUrl: auditService.getRepositoryWebUrl(),
  };
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
