import { error, fail, redirect } from '@sveltejs/kit';
import { cancanService, userAccessService } from '#modules/auth';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';

function errorResponse(error: unknown) {
  return fail(400, {
    error: error instanceof Error ? error.message : 'Organization action failed.',
  });
}

export async function load({ params }) {
  let organization;
  try {
    organization = await organizationService.findBySlug(params.org);
  } catch {
    throw error(404, 'Organization not found');
  }

  const [projects, members] = await Promise.all([
    projectService.listProjectsByOrganization(organization.id).catch(() => []),
    userAccessService.listUsers('organization', organization.id).catch(() => []),
  ]);

  return {
    organization,
    projects: projects.map((project) => ({
      id: project.id,
      slug: project.slug ?? '',
      name: project.name,
      status: project.status,
      modules: project.modules ?? null,
    })),
    memberCount: members.length,
  };
}

export const actions = {
  async updateOrganization({ request, params, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    let organization;
    try {
      const form = await request.formData();
      organization = await organizationService.updateOrganization(String(form.get('id') ?? ''), {
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        description: String(form.get('description') ?? ''),
      });
    } catch (error: unknown) {
      return errorResponse(error);
    }

    if (organization.slug !== params.org) {
      throw redirect(303, `/gitops-settings/orgs/${organization.slug}`);
    }

    return { success: true, organization };
  },

  async deleteOrganization({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await organizationService.deleteOrganization(String(form.get('id') ?? ''));
    } catch (error: unknown) {
      return errorResponse(error);
    }

    throw redirect(303, '/gitops-settings/orgs');
  },
};
