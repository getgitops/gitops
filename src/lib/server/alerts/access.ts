import { cancanService } from '#modules/auth';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import type { AlertActor, AlertLocation } from '#modules/alerts';
import type { PermissionGrant } from '#lib/permissions';

export type AlertAction = 'read' | 'create' | 'update' | 'delete';

/** What a request carries about its caller (`event.locals`). */
export type AlertLocals = {
  user?: { id: string; role?: unknown } | null;
  apiKey?: {
    id: string;
    projectId: string | null;
    userId: string | null;
    role: unknown;
  } | null;
};

export type PermissionContext =
  | { scope: 'organization'; organizationId: string }
  | { scope: 'project'; projectId: string; organizationId?: string };

export function contextOf(location: AlertLocation): PermissionContext {
  return location.scope === 'project' && location.projectId
    ? { scope: 'project', projectId: location.projectId, organizationId: location.organizationId }
    : { scope: 'organization', organizationId: location.organizationId };
}

/**
 * Checks `permission` for the caller: a session user through the role cascade, an API key
 * through `canApiKey` (a project key never leaves its project, so organization contexts fail).
 */
export async function callerCan(
  locals: AlertLocals,
  permission: PermissionGrant,
  context: PermissionContext,
): Promise<boolean> {
  if (locals.apiKey) {
    return cancanService.canApiKey(locals.apiKey as never, permission, context);
  }
  return cancanService.canSessionUser(locals.user as never, permission, context);
}

export function canManageAlerts(
  locals: AlertLocals,
  location: AlertLocation,
  action: AlertAction,
): Promise<boolean> {
  return callerCan(locals, `${location.scope}:alerts:${action}`, contextOf(location));
}

/** The caller as an alert author, for the anti-escalation check. */
export function actorFor(locals: AlertLocals): AlertActor | null {
  const userId = locals.apiKey ? (locals.apiKey.userId ?? locals.apiKey.id) : locals.user?.id;
  if (!userId) return null;
  return {
    userId,
    canRead: (permission, context) => callerCan(locals, permission, context),
  };
}

export type LocationLookup =
  { ok: true; location: AlertLocation } | { ok: false; status: 400 | 404; error: string };

/**
 * Location from request ids: a `projectId` makes it a project location (its organization comes
 * from the project and must match `organizationId` when both are given).
 */
export async function resolveLocation(ids: {
  organizationId?: string | null;
  projectId?: string | null;
}): Promise<LocationLookup> {
  const projectId = ids.projectId?.trim() || null;
  const organizationId = ids.organizationId?.trim() || null;

  if (projectId) {
    const project = await projectService.getProject(projectId).catch(() => null);
    const projectOrganizationId = project?.organization?.id ?? null;
    if (!project || !projectOrganizationId) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    if (organizationId && organizationId !== projectOrganizationId) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    return {
      ok: true,
      location: { scope: 'project', organizationId: projectOrganizationId, projectId: project.id },
    };
  }

  if (!organizationId) {
    return { ok: false, status: 400, error: 'organizationId or projectId is required' };
  }
  const organization = await organizationService.getOrganization(organizationId).catch(() => null);
  if (!organization) return { ok: false, status: 404, error: 'Organization not found' };
  return { ok: true, location: { scope: 'organization', organizationId, projectId: null } };
}
