import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { hashPassword } from '$lib/auth';

export async function PATCH({ request, params, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as { password?: string; role?: string };
    const id = params.id;

    if (data.password) {
      const hash = hashPassword(data.password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    if (data.role) {
      const nextRole = data.role === 'admin' ? 'admin' : 'developer';

      if (id === locals.user.id && nextRole !== 'admin') {
        return json({ error: 'You cannot remove your own admin role.' }, { status: 400 });
      }

      if (nextRole !== 'admin') {
        const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as
          | { role: string }
          | undefined;
        const adminCount = db
          .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
          .get() as { count: number };

        if (targetUser?.role === 'admin' && adminCount.count <= 1) {
          return json({ error: 'At least one admin user is required.' }, { status: 400 });
        }
      }

      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, id);
    }

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
    const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as
      | { role: string }
      | undefined;

    const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as {
      count: number;
    };

    if (targetUser?.role === 'admin' && adminCount.count <= 1) {
      return json({ error: 'At least one admin user is required.' }, { status: 400 });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return json({ error: message }, { status: 400 });
  }
}