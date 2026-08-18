import type { Handle } from '@sveltejs/kit';
import { authService, canAccessAdminArea, ensureAuthReady, oidcValidator } from './modules/auth';
import { getGitDb } from '$lib/server/gitdb';

getGitDb();

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === '/login' || event.url.pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  await ensureAuthReady();

  // Allow OIDC JWT bearer tokens on protected API routes
  if (event.url.pathname.startsWith('/api/')) {
    const authHeader = event.request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const result = await oidcValidator.validate(token);
      if (result.valid) {
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
