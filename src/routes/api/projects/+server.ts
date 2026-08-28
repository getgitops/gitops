import { json } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';
import { cancanService, roleService } from '../../../modules/auth';

export async function GET({ url, locals }) {
  if (
    !(await cancanService.canSessionUser(locals.user, 'cluster:projects:read', { scope: 'cluster' }))
  ) {
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
  try {
    const data = (await request.json()) as {
      organizationId?: string;
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: { vault?: boolean; openreport?: boolean; stateiac?: boolean };
    };

    const canCreate = data.organizationId
      ? await cancanService.canSessionUser(locals.user, 'organization:projects:create', {
          scope: 'organization',
          organizationId: data.organizationId,
        })
      : await cancanService.canSessionUser(locals.user, 'cluster:projects:create', {
          scope: 'cluster',
        });

    if (!canCreate) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const project = await projectService.createProject({
      organizationId: String(data.organizationId || ''),
      name: String(data.name || ''),
      slug: data.slug ? String(data.slug) : undefined,
      description: data.description ? String(data.description) : undefined,
      status: data.status ? String(data.status) : undefined,
      modules: data.modules,
    });

    await roleService.createDefaultProjectRoles(project.id);

    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
