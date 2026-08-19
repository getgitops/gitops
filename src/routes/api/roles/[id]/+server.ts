import { json } from '@sveltejs/kit';
import { roleService, isAdmin } from '../../../../modules/auth';

export async function PATCH({ request, params, locals }) {
  if (!locals.user || !isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as { name?: string; permissions?: string[] };

    const role = await roleService.updateRole(params.id, {
      name: data.name,
      permissions: data.permissions,
    });

    return json({ success: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  if (!locals.user || !isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await roleService.deleteRole(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete role';
    return json({ error: message }, { status: 400 });
  }
}
