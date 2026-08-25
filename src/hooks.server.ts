import type { Handle } from '@sveltejs/kit';
import { authService, cancanService, ensureAuthReady } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { isBootstrapCompleted, refreshBootstrapState } from '$lib/server/bootstrap';
import { startGitDb } from '$lib/server/gitdb';

// clone, manifest, sync poll and bootstrap detection run once per process
const serverReady = (async () => {
  await startGitDb();
  await ensureAuthReady();
  await refreshBootstrapState();
})();

serverReady.catch((error) => {
  console.error('[startup] failed', error);
});

const authWithToken = async (token: string) => {
  return true;
};

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isApiRequest = pathname.startsWith('/api/');

  try {
    await serverReady;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitDB is unavailable';
    return new Response(
      isApiRequest ? JSON.stringify({ error: message }) : `Startup failed: ${message}`,
      {
        status: 503,
        headers: { 'content-type': isApiRequest ? 'application/json' : 'text/plain' },
      },
    );
  }

  if (pathname.startsWith('/bootstrap')) {
    if (isBootstrapCompleted()) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
    return resolve(event);
  }

  if (!isBootstrapCompleted()) {
    if (isApiRequest) {
      return new Response(JSON.stringify({ error: 'Cluster is not bootstrapped yet' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 302, headers: { location: '/bootstrap' } });
  }

  // sign-in and sign-out must work without (or with a broken) session
  if (pathname === '/auth/login' || pathname === '/auth/logout') {
    return resolve(event);
  }

  if (isApiRequest) {
    const token = event.request.headers.get('Authorization') || '';
    if (!token || token.trim() === '') {
      return new Response(null, { status: 401 });
    }

    const isAuthenticated = await authWithToken(token);

    if (!isAuthenticated) {
      return new Response(null, { status: 401 });
    }
    return resolve(event);
  }

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = await authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    return new Response(null, { status: 302, headers: { location: '/auth/login' } });
  }

  const organizationSettingsMatch = event.url.pathname.match(/^\/org\/([^/]+)\/settings/);
  if (organizationSettingsMatch) {
    const organization = await organizationService.tryFindBySlug(organizationSettingsMatch[1]);
    if (
      !organization ||
      !(await cancanService.canManageOrganization(currentUser, organization.id))
    ) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  } else if (event.url.pathname.startsWith('/cluster-settings')) {
    if (!cancanService.canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  }

  return resolve(event);
};
