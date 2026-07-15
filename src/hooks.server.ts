import { authService, canAccessAdminArea } from './modules/auth';

export async function handle({ event, resolve }) {
  if (event.url.pathname === '/login' || event.url.pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  if (event.url.pathname.startsWith('/settings') || event.url.pathname.startsWith('/api/system')) {
    if (!canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/pulumi-state' } });
    }
  }

  return resolve(event);
}
