import { getConfig, getStorageBackends } from '$lib/config';
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

  const config = await getConfig();
  const sessionCookie = event.cookies.get('pos_session');
  const hasBackends = getStorageBackends().length > 0;
  let isAuthenticated = false;
  let currentUser: { id: string; username: string; role: string } | null = null;

  if (sessionCookie) {
    try {
      const [userId, signature] = sessionCookie.split('.');
      if (userId && signature) {
        const salt = ensureEncryptionKey();
        const expectedSignature = crypto.createHmac('sha256', salt).update(userId).digest('hex');

        if (signature === expectedSignature) {
          const user = db
            .prepare('SELECT id, username, role FROM users WHERE id = ?')
            .get(userId) as { id: string; username: string; role: string } | undefined;
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

  if (config?.publicAccess) {
    const isSettingsPath = event.url.pathname.startsWith('/settings');
    const isSystemPath = event.url.pathname.startsWith('/api/system');

    if (isSettingsPath || isSystemPath) {
      if (!isAuthenticated || currentUser?.role !== 'admin') {
        // During first-time setup, allow settings pages so a backend can be configured.
        if (!hasBackends && isSettingsPath) {
          return resolve(event);
        }

        return new Response(null, { status: 302, headers: { location: '/projects' } });
      }
    }
    return resolve(event);
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
