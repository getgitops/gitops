import type { Handle } from '@sveltejs/kit';
import { authService, canAccessAdminArea, ensureAuthReady, oidcValidator } from './modules/auth';
import { getGitDb } from '$lib/server/gitdb';

getGitDb();

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === '/login' || event.url.pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  await ensureAuthReady();

  // On API routes, a valid OIDC bearer token is an accepted alternative to a session cookie.
  // Session-cookie auth and future API-key auth remain fully operational alongside this.
  if (event.url.pathname.startsWith('/api/')) {
    const authHeader = event.request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const result = await oidcValidator.validate(token);
      if (result.valid) {
        event.locals.oidc = result.payload as Record<string, unknown>;
        event.locals.user = {
          id: String(result.payload.sub ?? 'oidc-service'),
          username: String(result.payload.sub ?? 'oidc-service'),
          email: null,
          role: 'admin',
        };
        return resolve(event);
      }
    }
  }

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = await authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  if (event.url.pathname.startsWith('/settings') || event.url.pathname.startsWith('/api/system')) {
    if (!canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/vault' } });
    }
  }

  return resolve(event);
};
