import { fail } from '@sveltejs/kit';
import { auditService } from '$modules/audit';
import { organizationService } from '$modules/organization';

export async function load({ url }) {
  const [{ events, page, perPage, total, totalPages }, organizations] = await Promise.all([
    auditService.listEvents({
      search: url.searchParams.get('search') || undefined,
      organizationId: url.searchParams.get('organizationId') || undefined,
      dateFrom: url.searchParams.get('from') || undefined,
      dateTo: url.searchParams.get('to') || undefined,
      page: Number(url.searchParams.get('page')) || undefined,
      perPage: Number(url.searchParams.get('perPage')) || undefined,
    }),
    organizationService.listOrganizations(),
  ]);

  return {
    events,
    pagination: { page, perPage, total, totalPages },
    organizations,
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
