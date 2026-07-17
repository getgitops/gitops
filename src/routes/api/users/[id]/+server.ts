import { json } from '@sveltejs/kit';
import { userManagementService } from '../../../../modules/auth';

export async function PATCH({ request, params, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as { password?: string; role?: string };
    const id = params.id;

    await userManagementService.updateUser({
      actorUserId: locals.user.id,
      targetUserId: id,
      password: data.password,
      role: data.role === 'admin' ? 'admin' : data.role === 'developer' ? 'developer' : undefined,
    });

    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params.id;

  if (id === locals.user.id) {
    return json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  try {
    await userManagementService.deleteUser(locals.user.id, id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return json({ error: message }, { status: 400 });
  }
}