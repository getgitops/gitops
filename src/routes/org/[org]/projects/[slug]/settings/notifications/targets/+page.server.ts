import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import {
  projectNotificationTargetService,
  projectNotificationTemplateService,
} from '$modules/project-notifications';
import { projectService } from '$modules/projects';

export async function load({ parent, locals }) {
  const { project } = await parent();
  const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  const templates = await projectNotificationTemplateService.list(project.id);
  return {
    targets: await projectNotificationTargetService.list(project.id, {
      includeCredentials: canUpdate,
    }),
    templates: templates.map(({ id, provider, name, slug }) => ({ id, provider, name, slug })),
    canUpdate,
  };
}

export const actions = {
  save: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);
    const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });
    if (!canUpdate) return fail(403, { error: 'Forbidden' });

    const form = await request.formData();
    try {
      await projectNotificationTargetService.save(project.id, {
        provider: String(form.get('provider') ?? ''),
        credential: String(form.get('credential') ?? ''),
        enabled: form.get('enabled') === 'on',
      });
      return { success: true, provider: String(form.get('provider') ?? '') };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Target configuration failed.',
      });
    }
  },

  setDefaultTemplate: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);
    const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });
    if (!canUpdate) return fail(403, { error: 'Forbidden' });

    const form = await request.formData();
    try {
      await projectNotificationTargetService.setDefaultTemplate(
        project.id,
        String(form.get('provider') ?? ''),
        String(form.get('templateId') ?? ''),
      );
      return { success: true, provider: String(form.get('provider') ?? '') };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Default template update failed.',
      });
    }
  },
};
