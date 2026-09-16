import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectNotificationService } from '$modules/project-notifications';
import { projectService } from '$modules/projects';

async function authorize(user: Parameters<typeof cancanService.canSessionUser>[0], slug: string) {
  const project = await projectService.getProjectBySlug(slug);
  const canUpdate = await cancanService.canSessionUser(user, 'project:project:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, canUpdate };
}

function errorResponse(error: unknown) {
  return fail(400, {
    error: error instanceof Error ? error.message : 'Notification action failed.',
  });
}

export async function load({ parent, locals }) {
  const { project } = await parent();
  const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  return {
    notifications: await projectNotificationService.listByProject(project.id),
    events: projectNotificationService.listEvents(),
    canUpdate,
  };
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const { project, canUpdate } = await authorize(locals.user, params.slug);
    if (!canUpdate) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();

    try {
      await projectNotificationService.create(project.id, {
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        eventName: String(form.get('eventName') ?? ''),
        channel: String(form.get('channel') ?? 'mail'),
        filters: JSON.parse(String(form.get('filters') ?? '[]')),
        recipients: String(form.get('recipients') ?? ''),
      });
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  },

  update: async ({ request, params, locals }) => {
    const { project, canUpdate } = await authorize(locals.user, params.slug);
    if (!canUpdate) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();

    try {
      await projectNotificationService.update(String(form.get('id') ?? ''), project.id, {
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        eventName: String(form.get('eventName') ?? ''),
        channel: String(form.get('channel') ?? 'mail'),
        filters: JSON.parse(String(form.get('filters') ?? '[]')),
        recipients: String(form.get('recipients') ?? ''),
      });
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  },

  toggle: async ({ request, params, locals }) => {
    const { project, canUpdate } = await authorize(locals.user, params.slug);
    if (!canUpdate) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();

    try {
      await projectNotificationService.setEnabled(
        String(form.get('id') ?? ''),
        project.id,
        form.get('enabled') === 'true',
      );
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  },

  delete: async ({ request, params, locals }) => {
    const { project, canUpdate } = await authorize(locals.user, params.slug);
    if (!canUpdate) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();

    try {
      await projectNotificationService.delete(String(form.get('id') ?? ''), project.id);
      return { success: true };
    } catch (error) {
      return errorResponse(error);
    }
  },
};
