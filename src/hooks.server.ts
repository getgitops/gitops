import type { Handle } from '@sveltejs/kit';
import { apiKeysService, authService, cancanService, ensureAuthReady } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { projectService } from '$modules/projects';
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

function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() || null : null;
}

function unauthorized(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

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

  // sign-in, sign-out, self-registration and invitation acceptance must work without (or with a
  // broken) session; the registration route itself re-checks the cluster toggle
  if (
    pathname === '/auth/login' ||
    pathname === '/auth/logout' ||
    pathname === '/auth/invitation' ||
    pathname === '/auth/registration'
  ) {
    return resolve(event);
  }

  // machine-to-machine path: `Authorization: Bearer gvs_...` resolves a project + role identity.
  // it coexists with the session cookie path below, which still serves browser requests to /api.
  const token = bearerToken(event.request);

  if (token) {
    // a project key is confined to its own project and must never reach the admin/global UI areas
    if (!isApiRequest) {
      return unauthorized('API keys can only be used on /api routes');
    }

    const apiKey = await apiKeysService.authenticate(token);

    if (!apiKey) {
      return unauthorized('Invalid API key');
    }

    event.locals.apiKey = apiKey;

    return runWithActor(
      { name: `apikey:${apiKey.name}`, email: `apikey+${apiKey.id}@gitops.local` },
      () => resolve(event),
    );
  }

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = await authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    if (isApiRequest) {
      return unauthorized('Authentication required');
    }
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
