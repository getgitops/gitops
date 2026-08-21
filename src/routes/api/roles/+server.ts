import { json } from '@sveltejs/kit';
import { roleService, cancanService } from '../../../modules/auth';

export async function GET({ locals, url }) {
  if (!locals.user) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const scope = (url.searchParams.get('scope') ?? 'cluster') as
      'cluster' | 'organization' | 'project';
    const scopeId =
      url.searchParams.get('organizationId') ?? url.searchParams.get('projectId') ?? undefined;
    const roles = await roleService.listRoles(scope, scopeId);
    return json({ roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list roles';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!cancanService.canAccessAdminArea(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      permissions?: string[];
      scope?: 'cluster' | 'organization' | 'project';
      organizationId?: string;
      projectId?: string;
    };

    const role = await roleService.createRole({
      name: data.name ?? '',
      slug: data.slug ?? '',
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      scope: data.scope,
      organizationId: data.organizationId,
      projectId: data.projectId,
    });

    return json({ success: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create role';
    return json({ error: message }, { status: 400 });
  }
}
