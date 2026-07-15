import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { db } from '$lib/db';
import { ensureEncryptionKey, verifyPassword } from '$lib/auth';

export async function POST({ request, cookies }) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      { id: string; username: string; password_hash: string } | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error('Invalid username or password');
    }

    const salt = ensureEncryptionKey();
    const signature = crypto.createHmac('sha256', salt).update(user.id).digest('hex');
    const sessionToken = `${user.id}.${signature}`;

    cookies.set('pos_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return json({ success: true });
  } catch {
    return json({ error: 'Invalid username or password' }, { status: 401 });
  }
}
