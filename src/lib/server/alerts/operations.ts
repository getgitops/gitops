import {
  getEventDefinition,
  isEventType,
  listAlertFields,
  listAlertableEvents,
  type EventDefinition,
} from '#lib/events/catalog';
import {
  AlertDomain,
  AlertNotFoundError,
  AlertValidationError,
  alertDirectory,
  alertEngine,
  alertService,
  buildSampleEvent,
  isMailConfigured,
  type AlertInput,
  type AlertLocation,
  type AlertRow,
} from '#modules/alerts';
import type { CatalogEntry } from '#lib/alerts/types';
import type { AnyDomainEvent } from '#lib/server/events';
import { RateLimiter } from '#lib/server/infra/rate-limit';
import { actorFor, callerCan, canManageAlerts, contextOf, type AlertLocals } from './access';

export type { CatalogEntry };

/** Outcome of an alert operation, mapped to JSON by the API and to `fail()` by form actions. */
export type AlertResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const forbidden = { ok: false as const, status: 403, error: 'Forbidden' };
const notFound = { ok: false as const, status: 404, error: 'Alert not found' };

function failure(error: unknown): AlertResult<never> {
  if (error instanceof AlertValidationError) {
    return { ok: false, status: 400, error: 'Invalid alert', errors: error.errors };
  }
  if (error instanceof AlertNotFoundError) return notFound;
  throw error;
}

// loaders and JSON responses can't carry functions: keep only data
function serializable(definition: EventDefinition, location: AlertLocation): CatalogEntry {
  const {
    link: _link,
    mailSummary: _mailSummary,
    mailTemplate: _mailTemplate,
    ...data
  } = definition;
  void _link;
  void _mailSummary;
  void _mailTemplate;
  return {
    ...data,
    fields: listAlertFields(definition, location.scope).map((field) => {
      const { derive, ...rest } = field;
      return derive ? { ...rest, derived: true } : rest;
    }),
  };
}

/**
 * Events an alert in `location` can watch and the caller is allowed to read: project events in a
 * project, every alertable event in an organization (project events then cover all projects).
 */
export async function listCatalog(
  locals: AlertLocals,
  location: AlertLocation,
): Promise<CatalogEntry[]> {
  const context = contextOf(location);
  const candidates = listAlertableEvents(location.scope === 'project' ? { scope: 'project' } : {});
  const visible: CatalogEntry[] = [];
  for (const definition of candidates) {
    const allowed =
      (await callerCan(locals, definition.readPermission, context)) ||
      (location.scope === 'organization' &&
        definition.scope === 'project' &&
        (await callerCan(locals, 'organization:projects:read', context)));
    if (allowed) visible.push(serializable(definition, location));
  }
  return visible;
}

async function loadAuthorized(
  locals: AlertLocals,
  id: string,
  action: 'read' | 'update' | 'delete',
): Promise<AlertResult<AlertDomain>> {
  const alert = await alertService.get(id).catch(() => null);
  if (!alert) return notFound;
  // an alert the caller can't read is indistinguishable from a missing one
  if (!(await canManageAlerts(locals, alert.location, 'read'))) return notFound;
  if (action !== 'read' && !(await canManageAlerts(locals, alert.location, action))) {
    return forbidden;
  }
  return { ok: true, status: 200, data: alert };
}

export async function listAlerts(
  locals: AlertLocals,
  location: AlertLocation,
): Promise<AlertResult<{ alerts: AlertRow[]; inherited: AlertRow[] }>> {
  if (!(await canManageAlerts(locals, location, 'read'))) return forbidden;
  const alerts = await alertService.list(location);
  const inherited =
    location.scope === 'project' && location.projectId
      ? await alertService.listInherited(location.organizationId, location.projectId)
      : [];
  return {
    ok: true,
    status: 200,
    data: {
      alerts: alerts.map((alert) => alert.toJson()),
      inherited: inherited.map((alert) => alert.toJson()),
    },
  };
}

export async function getAlert(locals: AlertLocals, id: string): Promise<AlertResult<AlertRow>> {
  const loaded = await loadAuthorized(locals, id, 'read');
  return loaded.ok ? { ...loaded, data: loaded.data.toJson() } : loaded;
}

export async function createAlert(
  locals: AlertLocals,
  location: AlertLocation,
  input: AlertInput,
): Promise<AlertResult<AlertRow>> {
  if (!(await canManageAlerts(locals, location, 'create'))) return forbidden;
  const actor = actorFor(locals);
  if (!actor) return forbidden;
  try {
    const alert = await alertService.create(location, input, actor);
    return { ok: true, status: 201, data: alert.toJson() };
  } catch (error) {
    return failure(error);
  }
}

export async function updateAlert(
  locals: AlertLocals,
  id: string,
  input: AlertInput,
): Promise<AlertResult<AlertRow>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  const actor = actorFor(locals);
  if (!actor) return forbidden;
  try {
    const alert = await alertService.update(id, input, actor);
    return { ok: true, status: 200, data: alert.toJson() };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAlert(
  locals: AlertLocals,
  id: string,
): Promise<AlertResult<{ id: string }>> {
  const loaded = await loadAuthorized(locals, id, 'delete');
  if (!loaded.ok) return loaded;
  try {
    await alertService.delete(id);
    return { ok: true, status: 200, data: { id } };
  } catch (error) {
    return failure(error);
  }
}

/** `payload` overrides the invented sample; `sampleProjectId` picks the project of a project event
 * for an organization alert. */
export type AlertTestInput = {
  payload?: unknown;
  sampleProjectId?: unknown;
  alertId?: unknown;
  send?: unknown;
};

const TEST_SEND_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };
const TEST_LIMITER_KEY = Symbol.for('gitops.alerts.test-send-limiter');
const testSendLimiter = ((globalThis as typeof globalThis & { [TEST_LIMITER_KEY]?: RateLimiter })[
  TEST_LIMITER_KEY
] ??= new RateLimiter(TEST_SEND_LIMIT));

export type AlertTestResult = {
  matched: boolean;
  recipients: Array<{ userId: string; username: string }>;
  /** Selected users left out because they can't read the event. */
  deniedCount: number;
  external: Array<{ email: string; status: string; delivers: boolean }>;
  channels: Array<{ id: string; name: string; type: string; delivers: boolean }>;
  delivery?: { sent: number; failed: number };
  event: { type: string; payload: Record<string, unknown>; projectId: string | null };
};

/**
 * Evaluates an alert against an example event and tells who would receive it. The throttle is not
 * touched.
 */
async function dryRun(
  locals: AlertLocals,
  alert: Pick<
    AlertDomain,
    | 'id'
    | 'name'
    | 'description'
    | 'organizationId'
    | 'eventType'
    | 'scope'
    | 'conditions'
    | 'match'
    | 'recipients'
    | 'channelIds'
    | 'location'
    | 'appliesTo'
  >,
  input: AlertTestInput,
): Promise<AlertResult<AlertTestResult>> {
  if (!isEventType(alert.eventType)) return { ok: false, status: 400, error: 'Unknown event type' };
  const send = input.send === true || input.send === 'true';
  const actor = actorFor(locals);
  const mailConfigured = isMailConfigured();
  if (send) {
    // the test goes to every destination of the alert: without SMTP only its channels get it
    if (!mailConfigured && (alert.channelIds ?? []).length === 0) {
      return { ok: false, status: 409, error: 'mail_not_configured' };
    }
    if (!actor || !testSendLimiter.consume(actor.userId).allowed) {
      return { ok: false, status: 429, error: 'test_rate_limited' };
    }
  }
  const definition = getEventDefinition(alert.eventType) as EventDefinition;
  const location = alert.location;

  const requestedProjectId =
    typeof input.sampleProjectId === 'string' ? input.sampleProjectId : null;
  const payloadOverride =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : undefined;
  const sample = buildSampleEvent(definition, alert, {
    complete: send,
    payload: payloadOverride,
    projectId: requestedProjectId,
  });

  let projectId: string | null = null;
  if (location.scope === 'project') projectId = location.projectId;
  else if (definition.scope === 'project' && sample.projectId) {
    const projects = await alertDirectory.listReferences('project', location);
    if (!projects.some((project) => project.id === sample.projectId)) {
      return {
        ok: false,
        status: 400,
        error: 'Project not found',
        errors: { sampleProjectId: 'unknown_reference' },
      };
    }
    projectId = sample.projectId;
  }

  if (send && mailConfigured && actor && alert.recipients.emails.length > 0) {
    await alertService.registerExternal(location, alert.recipients.emails, actor);
  }

  const result = await alertEngine.dryRun(alert, {
    type: alert.eventType,
    payload: sample.payload as never,
    scope: { organizationId: location.organizationId, projectId },
  });

  const delivery = send
    ? await alertEngine.sendTest(alert, {
        id: `test-${crypto.randomUUID()}`,
        type: alert.eventType,
        occurredAt: new Date().toISOString(),
        actor: actor ? { kind: 'user', userId: actor.userId } : { kind: 'system' },
        scope: { organizationId: location.organizationId, projectId },
        payload: sample.payload,
      } as AnyDomainEvent)
    : undefined;

  return {
    ok: true,
    status: 200,
    data: {
      matched: result.matched,
      recipients: result.recipients.map(({ userId, username }) => ({ userId, username })),
      deniedCount: result.denied.length,
      external: result.external,
      channels: result.channels,
      ...(delivery ? { delivery } : {}),
      event: { type: alert.eventType, payload: sample.payload, projectId },
    },
  };
}

export async function testAlert(
  locals: AlertLocals,
  id: string,
  input: AlertTestInput,
): Promise<AlertResult<AlertTestResult>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  return dryRun(locals, loaded.data, input);
}

/** "Test alert" before saving: validates the draft and dry-runs it. */
export async function testDraftAlert(
  locals: AlertLocals,
  location: AlertLocation,
  input: AlertInput & AlertTestInput,
): Promise<AlertResult<AlertTestResult>> {
  const canWrite =
    (await canManageAlerts(locals, location, 'create')) ||
    (await canManageAlerts(locals, location, 'update'));
  if (!canWrite) return forbidden;
  const actor = actorFor(locals);
  if (!actor) return forbidden;
  const existing =
    typeof input.alertId === 'string' && input.alertId
      ? await alertService.get(input.alertId).catch(() => null)
      : null;
  const sameLocation =
    existing &&
    existing.organizationId === location.organizationId &&
    existing.projectId === location.projectId;
  const previous = sameLocation
    ? { emails: existing.recipients.emails, channelIds: existing.channelIds }
    : {};
  try {
    const fields = await alertService.validate(location, input, actor, previous);
    const draft = new AlertDomain({
      id: sameLocation ? existing.id : 'draft',
      ...location,
      ...fields,
    });
    return dryRun(locals, draft, input);
  } catch (error) {
    return failure(error);
  }
}
