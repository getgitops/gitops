import type { Handle } from '@sveltejs/kit';
import { authService, cancanService, ensureAuthReady } from '$modules/auth';
import { ensureOrganizationReady, organizationService } from '$modules/organization';
import { getBootstrapState, isBootstrapCompletedCached } from '$lib/server/bootstrap';
import { getGitDb } from '$lib/server/gitdb';

const authWithToken = async (token: string) => {
  return true;
};

async function isBootstrapCompleted(): Promise<boolean> {
  if (isBootstrapCompletedCached()) return true;
  return (await getBootstrapState()).completed;
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isApiRequest = pathname.startsWith('/api/');

  if (pathname.startsWith('/bootstrap')) {
    if (await isBootstrapCompleted()) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
    return resolve(event);
  }

  if (!(await isBootstrapCompleted())) {
    if (isApiRequest) {
      return new Response(JSON.stringify({ error: 'Cluster is not bootstrapped yet' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 302, headers: { location: '/bootstrap' } });
  }

  getGitDb();

  if (pathname === '/login') {
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
