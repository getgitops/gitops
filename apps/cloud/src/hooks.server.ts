import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { apiKeysService, authService, cancanService, ensureAuthReady } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { projectService } from '$modules/projects';
import { isBootstrapCompleted, refreshBootstrapState } from '$lib/server/bootstrap';
import { startGitDb } from '$lib/server/gitdb';
import { markServerFailed, markServerReady } from '$lib/server/server-ready';
import { runWithActor } from '$lib/server/request-context';
import {
  createLogger,
  createRequestLogger,
  logHttpRequest,
  logger,
} from '$lib/server/logger';

const startupLog = createLogger('startup');

// clone, manifest, sync poll and bootstrap detection run once per process
const serverReady = (async () => {
  await startGitDb();
  await ensureAuthReady();
  await refreshBootstrapState();
  markServerReady();
})();

serverReady.catch((error) => {
  startupLog.error(error, '[startup] failed');
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

// outermost hook: binds a trace-aware logger to the request and emits the httpRequest
// entry Cloud Logging groups everything under, whatever the inner hook ends up returning
const requestLogger: Handle = async ({ event, resolve }) => {
  const log = createRequestLogger(event);
  event.locals.logger = log;

  const startMs = performance.now();
  const response = await resolve(event);
  logHttpRequest(log, event, response, startMs);

  return response;
};

const authGuard: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isApiRequest = pathname.startsWith('/api/');

  if (pathname === '/health') {
    return resolve(event);
  }

  // readiness gating happens at the infrastructure level: Cloud Run's startup probe
  // polls /health and only routes traffic once the server reports ready
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

  // sign-in, sign-out, self-registration, password recovery and invitation acceptance must work
  // without (or with a broken) session; each route re-checks whatever it needs server-side
  if (
    pathname === '/auth/login' ||
    pathname === '/auth/logout' ||
    pathname === '/auth/invitation' ||
    pathname === '/auth/registration' ||
    pathname === '/auth/recover-password' ||
    pathname === '/auth/reset-password'
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

export const handle = sequence(requestLogger, authGuard);

// unexpected errors from load/actions/endpoints land here: log with the request's
// trace-aware logger so the entry is correlated with the failed httpRequest
export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const log = event.locals.logger ?? logger;
  const err = error instanceof Error ? error : new Error(String(error));
  log.error(err, `[${status}] ${message}`);
};
