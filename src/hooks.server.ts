import { db } from '$lib/db';
import crypto from 'crypto';
import { ensureEncryptionKey } from '$lib/auth';

export async function handle({ event, resolve }) {
  if (
    event.url.pathname.startsWith('/api/') &&
    !event.url.pathname.startsWith('/api/auth/') &&
    !event.url.pathname.startsWith('/api/system/')
  ) {
    return resolve(event);
  }

  if (event.url.pathname === '/login' || event.url.pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  const sessionCookie = event.cookies.get('pos_session');
  let isAuthenticated = false;
  let currentUser: { id: string; username: string; email: string | null; role: string } | null = null;

  if (sessionCookie) {
    try {
      const [userId, signature] = sessionCookie.split('.');
      if (userId && signature) {
        const salt = ensureEncryptionKey();
        const expectedSignature = crypto.createHmac('sha256', salt).update(userId).digest('hex');

        if (signature === expectedSignature) {
          const user = db
            .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
            .get(userId) as { id: string; username: string; email: string | null; role: string } | undefined;
          if (user) {
            isAuthenticated = true;
            currentUser = user;
            event.locals.user = user;
          }
        }
      }
    } catch (error) {
      console.error('Session verification failed', error);
    }
  }

  if (!isAuthenticated) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  if (event.url.pathname.startsWith('/settings') || event.url.pathname.startsWith('/api/system')) {
    if (currentUser?.role !== 'admin') {
      return new Response(null, { status: 302, headers: { location: '/projects' } });
    }
  }

  return resolve(event);
}
