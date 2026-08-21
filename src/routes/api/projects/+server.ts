import { json } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';
import { can } from '../../../modules/auth';

export async function GET({ url, locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const organizationId = url.searchParams.get('organizationId');
    const projects = organizationId
      ? await projectService.listProjectsByOrganization(organizationId)
      : await projectService.listProjects();
    return json({ projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!can(locals.user, 'stateiac:create')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as {
      organizationId?: string;
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: { vault?: boolean; openreport?: boolean; stateiac?: boolean };
    };

    const project = await projectService.createProject({
      organizationId: String(data.organizationId || ''),
      name: String(data.name || ''),
      slug: data.slug ? String(data.slug) : undefined,
      description: data.description ? String(data.description) : undefined,
      status: data.status ? String(data.status) : undefined,
      modules: data.modules,
    });

    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
