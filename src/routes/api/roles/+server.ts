import { json } from '@sveltejs/kit';
import { roleService, isAdmin } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!locals.user) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const roles = await roleService.listRoles();
    return json({ roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list roles';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!locals.user || !isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as { name?: string; slug?: string; permissions?: string[] };

    const role = await roleService.createRole({
      name: data.name ?? '',
      slug: data.slug ?? '',
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    });

    return json({ success: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create role';
    return json({ error: message }, { status: 400 });
  }
}
