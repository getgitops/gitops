import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { apiKeysService, authService, cancanService, ensureAuthReady } from '#modules/auth';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import { registerAlertEngine } from '#modules/alerts';
import { registerStateIac } from '#modules/state-iac';
import { getMonitoringConfig, startMonitoring } from '#modules/monitoring';
import {
  isInternalMonitoringRequest,
  verifyWorkerRequest,
} from '#lib/server/monitoring/internal-auth';
import { isBootstrapCompleted, refreshBootstrapState } from '#lib/server/bootstrap';
import { startGitDb } from '#lib/server/gitdb';
import { getServerReadyState, markServerFailed, markServerReady } from '#lib/server/server-ready';
import { renderStartingPage } from '#lib/server/starting-page';
import { runWithActor } from '#lib/server/request-context';
import { csrfForbiddenResponse, isCsrfForbidden } from '#lib/server/csrf';
import { returnToCookie } from '#lib/server/return-to';
import {
  SLACK_CALLBACK_PATH,
  SLACK_COMMANDS_PATH,
  SLACK_CONNECT_PATH,
  SLACK_DONE_PATH,
  SLACK_INTERACTIONS_PATH,
  SLACK_LINK_PATH,
} from '#modules/notifications';
import { rememberDevOrigin } from '#lib/server/infra/notifications';
import { createLogger, createRequestLogger, logHttpRequest, logger } from '#lib/server/logger';

const startupLog = createLogger('startup');

// clone, manifest, sync poll and bootstrap detection run once per process
const serverReady = (async () => {
  await startGitDb();
  await ensureAuthReady();
  // once per process (HMR-safe): system notifications and alerts on every published event
  registerAlertEngine();
  // State IaC bindings follow the projects they point at
  registerStateIac();
  await refreshBootstrapState();
  markServerReady();
  // monitoring needs GitDB; if its repository or runtime can't start, the rest of the app still does
  startMonitoring().catch((error) =>
    startupLog.error(error, '[startup] monitoring failed to start'),
  );
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

// SvelteKit's CSRF origin check (disabled in the framework, see `#lib/server/csrf`): like the
// framework, it only applies in production
const csrfGuard: Handle = async ({ event, resolve }) => {
  if (!import.meta.env.DEV && isCsrfForbidden(event.request, event.url)) {
    return csrfForbiddenResponse(event.request);
  }
  return resolve(event);
};

const authGuard: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  if (import.meta.env.DEV) rememberDevOrigin(event.url.origin);
  const isApiRequest = pathname.startsWith('/api/');

  if (pathname === '/health') {
    return resolve(event);
  }

  // the bootstrap state is only meaningful once startup has finished: before that it reads as
  // "pending" and every request would be sent to (and allowed into) the unauthenticated wizard.
  // Vite dev loads this module on the first request, and in production nothing guarantees an
  // infrastructure probe holds traffic back, so nothing past this point runs until startup is
  // done: pages get a "GitOps is starting" landing that reloads itself, APIs get a 503.
  const readiness = getServerReadyState();
  if (readiness.status !== 'ready') {
    const state = readiness.status === 'error' ? 'failed' : 'starting';
    if (isApiRequest) {
      return new Response(
        JSON.stringify({
          error: state === 'failed' ? 'Server failed to start' : 'Server is starting',
        }),
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            ...(state === 'starting' ? { 'retry-after': '3' } : {}),
          },
        },
      );
    }
    return renderStartingPage(state, event.request.headers.get('accept-language'));
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

  // legacy URL: the admin area moved from /cluster-settings to /gitops-settings; keep old
  // bookmarks working (the new path is still guarded below)
  if (pathname === '/cluster-settings' || pathname.startsWith('/cluster-settings/')) {
    const location = pathname.replace('/cluster-settings', '/gitops-settings') + event.url.search;
    return new Response(null, { status: 308, headers: { location } });
  }

  // internal worker API: its own shared secret (MONITORING_WORKER_TOKEN), never an API key or a
  // session, and never an actor (its writes are system writes)
  if (isInternalMonitoringRequest(pathname)) {
    const denied = verifyWorkerRequest(event.request, getMonitoringConfig());
    if (denied) return denied;
    return resolve(event);
  }

  if (
    pathname === '/notifications/verify' ||
    pathname === '/notifications/unsubscribe' ||
    // Slack's requests: authenticated by their signature in the handlers
    pathname === SLACK_COMMANDS_PATH ||
    pathname === SLACK_INTERACTIONS_PATH ||
    // a channel connected from Slack: the signed link and the Slack user identify the caller
    pathname === SLACK_CONNECT_PATH ||
    pathname === SLACK_DONE_PATH ||
    pathname === '/auth/login' ||
    pathname === '/auth/sso/google/start' ||
    pathname === '/auth/sso/google/callback' ||
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
      {
        name: `apikey:${apiKey.name}`,
        email: `apikey+${apiKey.id}@gitops.local`,
        apiKeyId: apiKey.id,
        apiKeyProjectId: apiKey.projectId,
      },
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
    // the Slack app's redirect URL serves flows that need this session ("Add to Slack", the app
    // install: they fail without it) and channels connected from Slack (no session needed)
    if (pathname === SLACK_CALLBACK_PATH) {
      return resolve(event);
    }
    const headers = new Headers({ location: '/auth/login' });
    // `/gitops login`: come back to the link once signed in
    if (pathname === SLACK_LINK_PATH) {
      const cookie = returnToCookie(event.cookies, `${pathname}${event.url.search}`);
      if (cookie) headers.append('set-cookie', cookie);
    }
    return new Response(null, { status: 302, headers });
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
  } else if (event.url.pathname.startsWith('/gitops-settings')) {
    if (!cancanService.canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  }

  const actor = {
    name: currentUser.username,
    email: currentUser.email || `${currentUser.username}@gitops.local`,
    userId: currentUser.id,
  };
  return runWithActor(actor, () => resolve(event));
};

export const handle = sequence(requestLogger, csrfGuard, authGuard);

// unexpected errors from load/actions/endpoints land here: log with the request's
// trace-aware logger so the entry is correlated with the failed httpRequest
export const handleError: HandleServerError = ({ error, event, kind }) => {
  const log = event.locals.logger ?? logger;
  const status =
    kind === 'framework' || kind === 'validation'
      ? error.status
      : kind === 'app'
        ? (error.status ?? 500)
        : 500;
  const message =
    kind === 'framework' || kind === 'validation' || kind === 'app'
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  const err = error instanceof Error ? error : new Error(message);
  log.error(err, `[${status}] ${message}`);
};
