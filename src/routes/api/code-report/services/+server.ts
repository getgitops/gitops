import { json } from '@sveltejs/kit';
import { codeReportService } from '../../../../modules/code-report';
import { projectService } from '../../../../modules/projects';
import { cancanService } from '../../../../modules/auth';

export async function GET({ url, locals }) {
  const projectId = url.searchParams.get('projectId');
  if (!projectId) {
    return json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const project = await projectService.getProject(projectId);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:read', {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const services = await codeReportService.listByProject(projectId);
    return json({ services });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

export async function POST({ request, locals }) {
  try {
    const data = (await request.json()) as {
      projectId?: string;
      name?: string;
      slug?: string;
      description?: string;
      tags?: string[];
    };

    const project = await projectService.getProject(String(data.projectId || ''));
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:create', {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = await codeReportService.createService({
      projectId: project.id,
      name: String(data.name || ''),
      slug: data.slug ? String(data.slug) : undefined,
      description: data.description ? String(data.description) : undefined,
      tags: data.tags,
    });

    return json({ success: true, service });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
