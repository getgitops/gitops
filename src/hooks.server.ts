import type { Handle } from '@sveltejs/kit';
import { authService, canAccessAdminArea, ensureAuthReady } from './modules/auth';
import { ensureOrganizationReady } from './modules/organization';
import { getGitDb } from '$lib/server/gitdb';

getGitDb();

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === '/login' || event.url.pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  await ensureAuthReady();
  await ensureOrganizationReady();


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
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  }

  return resolve(event);
};
