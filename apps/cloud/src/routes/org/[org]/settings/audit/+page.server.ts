import { error, fail } from '@sveltejs/kit';
import { auditService } from '$modules/audit';
import { cancanService } from '$modules/auth';
import { organizationService } from '$modules/organization';

export async function load({ parent, url, locals }) {
  const { organization } = await parent();

  if (
    !(await cancanService.canSessionUser(locals.user, 'organization:audit:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

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
  async viewDiff({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (
      !(await cancanService.canSessionUser(locals.user, 'organization:audit:read', {
        scope: 'organization',
        organizationId: organization.id,
      }))
    ) {
      return fail(403, { error: 'Forbidden' });
    }

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
      return fail(500, {
        error: error instanceof Error ? error.message : 'Failed to load changes.',
      });
    }
  },
};
