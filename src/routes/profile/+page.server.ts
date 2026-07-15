import crypto from 'crypto';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db';
import { hashPassword, verifyPassword } from '$lib/auth';
import { getStorageBackends } from '$lib/config';

function hashApiKey(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function load({ locals, cookies }) {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const user = db
    .prepare('SELECT id, username, email, role, password_hash FROM users WHERE id = ?')
    .get(locals.user.id) as
    | {
        id: string;
        username: string;
        email: string | null;
        role: string;
        password_hash: string;
      }
    | undefined;

  if (!user) {
    throw redirect(302, '/login');
  }

  const backends = getStorageBackends();
  const activeBackendId = cookies.get('active_backend') || backends[0]?.id || null;
  const activeBackend = backends.find((backend) => backend.id === activeBackendId) || null;
  const gcpConnected = activeBackend?.provider === 'gcs';

  const apiKeys = db
    .prepare(
      `
      SELECT id, name, key_prefix, last_used_at, created_at, revoked_at
      FROM api_keys
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
    `,
    )
    .all(user.id) as {
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }[];

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    gcpConnected,
    apiKeys: apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.key_prefix,
      lastUsedAt: key.last_used_at,
      createdAt: key.created_at,
    })),
  };
}

export const actions = {
  updateProfile: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const email = String(formData.get('email') || '').trim() || null;

    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, locals.user.id);

    return { section: 'profile', message: 'Profile updated.' };
  },

  updatePassword: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return fail(400, { section: 'password', message: 'Complete all password fields.' });
    }

    if (newPassword.length < 8) {
      return fail(400, { section: 'password', message: 'Password must be at least 8 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return fail(400, { section: 'password', message: 'Passwords do not match.' });
    }

    const user = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(locals.user.id) as { password_hash: string } | undefined;

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return fail(400, { section: 'password', message: 'Current password is incorrect.' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword),
      locals.user.id,
    );

    return { section: 'password', message: 'Password updated.' };
  },

  createApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();

    if (!name) {
      return fail(400, { section: 'apiKeys', message: 'Key name is required.' });
    }

    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();

    db.prepare(
      `
      INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(id, locals.user.id, name, token.slice(0, 10), hashApiKey(token));

    return { section: 'apiKeys', message: 'API key created.', createdKey: token };
  },

  revokeApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const keyId = String(formData.get('keyId') || '');

    db.prepare(
      `
      UPDATE api_keys
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    ).run(keyId, locals.user.id);

    return { section: 'apiKeys', message: 'API key revoked.' };
  },
};