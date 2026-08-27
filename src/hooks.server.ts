import type { Handle } from '@sveltejs/kit';
import { authService, cancanService, ensureAuthReady } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { isBootstrapCompleted, refreshBootstrapState } from '$lib/server/bootstrap';
import { startGitDb } from '$lib/server/gitdb';
import { isServerReady, markServerFailed, markServerReady } from '$lib/server/server-ready';
import { runWithActor } from '$lib/server/request-context';

// clone, manifest, sync poll and bootstrap detection run once per process
const serverReady = (async () => {
  await startGitDb();
  await ensureAuthReady();
  await refreshBootstrapState();
  markServerReady();
})();

serverReady.catch((error) => {
  console.error('[startup] failed', error);
  markServerFailed(error);
});

const authWithToken = async (token: string) => {
  return true;
};

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isApiRequest = pathname.startsWith('/api/');

  // while starting up (or if startup failed), skip all validation and show maintenance page
  if (!isServerReady()) {
    if (pathname === '/maintenance') {
      return resolve(event);
    }
    if (isApiRequest) {
      return new Response(JSON.stringify({ error: 'Server is starting up' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 302, headers: { location: '/maintenance' } });
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
    return runWithActor({ name: 'apikey', email: 'apikey@gitops.local' }, () => resolve(event));
  }

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = await authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    return new Response(null, { status: 302, headers: { location: '/auth/login' } });
  }

  const projectSettingsMatch = event.url.pathname.match(
    /^\/org\/[^/]+\/projects\/([^/]+)\/settings/,
  );
  const organizationSettingsMatch = event.url.pathname.match(/^\/org\/([^/]+)\/settings/);

  if (projectSettingsMatch) {
    const project = await projectService.tryFindBySlug(projectSettingsMatch[1]);
    if (
      !project ||
      !(await cancanService.canManageProject(currentUser, project.id, project.organization?.id))
    ) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  } else if (organizationSettingsMatch) {
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

  const actor = {
    name: currentUser.username,
    email: currentUser.email || `${currentUser.username}@gitops.local`,
  };
  return runWithActor(actor, () => resolve(event));
};
