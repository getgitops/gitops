import crypto from 'crypto';
import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { hashPassword } from '$lib/auth';

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  created_at: string;
};

export async function GET({ locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const users = db
      .prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC')
      .all() as UserRow[];

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

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (@id, @username, @email, @password_hash, @role)
    `,
    ).run({
      id,
      username,
      email: null,
      password_hash: passwordHash,
      role,
    });

    return json({
      success: true,
      user: {
        id,
        username,
        email: null,
        role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create user';

    if (message.includes('UNIQUE constraint failed')) {
      return json({ error: 'Username already exists' }, { status: 400 });
    }

    return json({ error: message }, { status: 400 });
  }
}