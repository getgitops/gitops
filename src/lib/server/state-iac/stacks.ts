import {
  stateIacService,
  type BackendStacks,
  type DiffOutcome,
  type IacHistoryPage,
  type IacResource,
  type IacValue,
  type StackDashboard,
  type StackListItem,
} from '#modules/state-iac';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import { callerCan, type AlertLocals } from '#lib/server/alerts/access';
import type { StateIacResult } from './backends';

/**
 * Who sees which stacks:
 * - from a project: `project:stateiac:stacks:read` lists the stacks assigned to it and
 *   `project:stateiac:states:read` opens their resources and outputs. A stack that is not
 *   assigned to the project answers 404, like a missing one;
 * - from the organization: `organization:stateiac:stacks:read` sees every stack, assigned or not.
 * A project API key only ever reaches its own project (`callerCan`).
 */
export type StackScope =
  | { scope: 'project'; projectId: string; organizationId: string }
  | { scope: 'organization'; organizationId: string };

const forbidden = { ok: false as const, status: 403, error: 'Forbidden' };
const notFound = { ok: false as const, status: 404, error: 'Stack not found' };

function can(locals: AlertLocals, scope: StackScope, permission: 'stacks' | 'states' | 'history') {
  if (scope.scope === 'project') {
    return callerCan(locals, `project:stateiac:${permission}:read`, {
      scope: 'project',
      projectId: scope.projectId,
      organizationId: scope.organizationId,
    });
  }
  // the organization view has a single grant for the list and the contents
  return callerCan(locals, 'organization:stateiac:stacks:read', {
    scope: 'organization',
    organizationId: scope.organizationId,
  });
}

/** `projectId` (preferred) or `organizationId` of a request, checked to exist. */
export async function resolveStackScope(ids: {
  projectId?: unknown;
  organizationId?: unknown;
}): Promise<StateIacResult<StackScope>> {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const projectId = text(ids.projectId);
  if (projectId) {
    const project = await projectService.getProject(projectId).catch(() => null);
    const organizationId = project?.organization?.id;
    if (!project || !organizationId) return { ok: false, status: 404, error: 'Project not found' };
    return { ok: true, status: 200, data: { scope: 'project', projectId, organizationId } };
  }
  const organizationId = text(ids.organizationId);
  if (!organizationId) {
    return { ok: false, status: 400, error: 'projectId or organizationId is required' };
  }
  const organization = await organizationService.getOrganization(organizationId).catch(() => null);
  if (!organization) return { ok: false, status: 404, error: 'Organization not found' };
  return { ok: true, status: 200, data: { scope: 'organization', organizationId } };
}

export async function canReadStates(locals: AlertLocals, scope: StackScope): Promise<boolean> {
  return can(locals, scope, 'states');
}

export async function listStacks(
  locals: AlertLocals,
  scope: StackScope,
  options: { refresh?: boolean } = {},
): Promise<StateIacResult<{ backends: BackendStacks[] }>> {
  if (!(await can(locals, scope, 'stacks'))) return forbidden;
  const backends =
    scope.scope === 'project'
      ? await stateIacService.listProjectStacks(scope.projectId, options)
      : await stateIacService.listOrganizationStacks(scope.organizationId, options);
  return { ok: true, status: 200, data: { backends } };
}

export type StackInclude = 'resources' | 'outputs';

export type StackDetailView = {
  summary: StackListItem;
  backend: { id: string; name: string; location: string };
  resources?: IacResource[];
  outputs?: Record<string, IacValue>;
};

/** One stack; `include` adds its resources and/or outputs (needs `states:read` in a project). */
export async function getStack(
  locals: AlertLocals,
  scope: StackScope,
  ref: { backendId: string; project: string; stack: string },
  include: StackInclude[],
  options: { refresh?: boolean } = {},
): Promise<StateIacResult<StackDetailView>> {
  if (!(await can(locals, scope, 'stacks'))) return notFound;
  if (include.length > 0 && !(await can(locals, scope, 'states'))) return forbidden;
  const detail =
    scope.scope === 'project'
      ? await stateIacService.getProjectStack(
          scope.projectId,
          ref.backendId,
          ref.project,
          ref.stack,
          options,
        )
      : await stateIacService.getOrganizationStack(
          scope.organizationId,
          ref.backendId,
          ref.project,
          ref.stack,
          options,
        );
  if (!detail) return notFound;
  const backend = (await stateIacService.backendHead(ref.backendId)) ?? {
    id: ref.backendId,
    name: '',
    location: '',
  };
  return {
    ok: true,
    status: 200,
    data: {
      summary: detail.summary,
      backend,
      ...(include.includes('resources') ? { resources: detail.snapshot.resources } : {}),
      ...(include.includes('outputs') ? { outputs: detail.snapshot.outputs } : {}),
    },
  };
}

export function parseInclude(value: string | null): StackInclude[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part): part is StackInclude => part === 'resources' || part === 'outputs'),
    ),
  ];
}

type StackRef = { backendId: string; project: string; stack: string };

/** The stack if the scope may see it at all (any State IaC read grant), else 404. */
async function locateFor(locals: AlertLocals, scope: StackScope, ref: StackRef, refresh = false) {
  const [stacks, history, states] = await Promise.all([
    can(locals, scope, 'stacks'),
    can(locals, scope, 'history'),
    can(locals, scope, 'states'),
  ]);
  if (!stacks && !history && !states) return null;
  const viewer =
    scope.scope === 'project'
      ? { projectId: scope.projectId }
      : { organizationId: scope.organizationId };
  return stateIacService.locate(viewer, ref.backendId, ref.project, ref.stack, { refresh });
}

/** Update history, newest first: `project:stateiac:history:read` in a project. */
export async function getStackHistory(
  locals: AlertLocals,
  scope: StackScope,
  ref: StackRef,
  page: { cursor?: string | null; limit?: number },
): Promise<StateIacResult<IacHistoryPage>> {
  const located = await locateFor(locals, scope, ref);
  if (!located) return notFound;
  if (!(await can(locals, scope, 'history'))) return forbidden;
  const cursor = page.cursor && /^\d+$/.test(page.cursor) ? page.cursor : null;
  return {
    ok: true,
    status: 200,
    data: await stateIacService.history(located, { ...page, cursor }),
  };
}

/**
 * Diff between two versions of the state (`project:stateiac:states:read` in a project): by default
 * the last update against the one before. `sources` lists what can be compared.
 */
export async function getStackDiff(
  locals: AlertLocals,
  scope: StackScope,
  ref: StackRef,
  ids: { from?: string | null; to?: string | null },
): Promise<StateIacResult<DiffOutcome>> {
  const located = await locateFor(locals, scope, ref);
  if (!located) return notFound;
  if (!(await can(locals, scope, 'states'))) return forbidden;
  return { ok: true, status: 200, data: await stateIacService.diff(located, ids) };
}

export async function canReadHistory(locals: AlertLocals, scope: StackScope): Promise<boolean> {
  return can(locals, scope, 'history');
}

/**
 * Dashboard of one stack seen from a project: the summary and health need `stacks:read`, the
 * updates `history:read`, and resources and last changes `states:read`; what the caller may not
 * read comes back `null`. A stack that is not visible to the project is a 404.
 */
export async function getProjectDashboard(
  locals: AlertLocals,
  scope: Extract<StackScope, { scope: 'project' }>,
  ref: StackRef,
  options: { refresh?: boolean } = {},
): Promise<StateIacResult<StackDashboard>> {
  if (!(await can(locals, scope, 'stacks'))) return notFound;
  const located = await locateFor(locals, scope, ref, options.refresh);
  if (!located) return notFound;
  const [withHistory, withStates] = await Promise.all([
    can(locals, scope, 'history'),
    can(locals, scope, 'states'),
  ]);
  return {
    ok: true,
    status: 200,
    data: await stateIacService.dashboard(located, { withHistory, withStates }),
  };
}
