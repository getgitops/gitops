import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectNotificationTemplateService } from '$modules/project-notifications';
import { projectService } from '$modules/projects';

async function authorize(locals: RequestEvent['locals'], slug: string) {
  const project = await projectService.getProjectBySlug(slug);
  const allowed = await cancanService.canSessionUser(locals.user, 'project:project:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, allowed };
}

export async function load({ parent, locals }) {
  const { project } = await parent();
  const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return {
    templates: await projectNotificationTemplateService.list(project.id, {
      includeHttpConfig: canUpdate,
    }),
    canUpdate,
  };
}

function input(form: FormData) {
  return {
    provider: String(form.get('provider') ?? ''),
    name: String(form.get('name') ?? ''),
    content: String(form.get('content') ?? ''),
    format: String(form.get('format') ?? ''),
    httpConfig: {
      url: String(form.get('httpUrl') ?? ''),
      method: String(form.get('httpMethod') ?? 'POST'),
      headers: String(form.get('httpHeaders') ?? '{}'),
    },
    recipients: String(form.get('recipients') ?? ''),
  };
}

function failure(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Template action failed.' });
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(locals, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });
    try {
      await projectNotificationTemplateService.create(project.id, input(await request.formData()));
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  },
  update: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(locals, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();
    try {
      await projectNotificationTemplateService.update(
        String(form.get('id') ?? ''),
        project.id,
        input(form),
      );
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  },
  delete: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(locals, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });
    const form = await request.formData();
    try {
      await projectNotificationTemplateService.delete(String(form.get('id') ?? ''), project.id);
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  },
};
