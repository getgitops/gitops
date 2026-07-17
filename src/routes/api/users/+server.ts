import { json } from '@sveltejs/kit';
import { userManagementService } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const users = (await userManagementService.listUsers()).map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.createdAt,
    }));

    return json({ users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list users';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as { username?: string; password?: string; role?: string };

    const username = data.username?.trim() || '';
    const password = data.password?.trim() || '';
    const role = data.role === 'admin' ? 'admin' : 'developer';

    if (!username) {
      return json({ error: 'Username is required' }, { status: 400 });
    }

    if (!password) {
      return json({ error: 'Password is required' }, { status: 400 });
    }

    const user = await userManagementService.createUser({
      username,
      password,
      role,
      email: null,
    });

    return json({
      success: true,
      user,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create user';

    if (message.includes('UNIQUE constraint failed')) {
      return json({ error: 'Username already exists' }, { status: 400 });
    }

    return json({ error: message }, { status: 400 });
  }
}