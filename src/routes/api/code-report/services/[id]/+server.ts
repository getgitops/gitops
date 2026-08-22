import { json } from '@sveltejs/kit';
import { codeReportService } from '../../../../../modules/code-report';
import { cancanService } from '../../../../../modules/auth';

export async function GET({ params, locals }) {
  try {
    const service = await codeReportService.getById(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:read', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    return json({ service });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 404 });
  }
}

export async function PATCH({ request, params, locals }) {
  try {
    const currentService = await codeReportService.getById(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:update', {
        scope: 'project',
        projectId: currentService.projectId,
        organizationId: currentService.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      tags?: string[];
    };

    const service = await codeReportService.updateService(params.id, {
      name: data.name,
      slug: data.slug,
      description: data.description,
      tags: data.tags,
    });

    return json({ success: true, service });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  try {
    const service = await codeReportService.getById(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:delete', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    await codeReportService.deleteService(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
