import {
  StateBackendNotFoundError,
  StateIacValidationError,
  stateBackendService,
  stateBindingService,
  type BackendInput,
  type BackendTestResult,
  type BindingInput,
  type PulumiLayout,
  type StateBackendView,
} from '#modules/state-iac';
import { organizationService } from '#modules/organization';
import { callerCan, type AlertLocals } from '#lib/server/alerts/access';

/**
 * State IaC backends and bindings for the API and the settings page. Every operation checks
 * `organization:stateiac:backends:<action>` in the backend's organization; a backend of an
 * organization the caller can't read answers 404, like a missing one.
 */
export type BackendAction = 'read' | 'create' | 'update' | 'delete' | 'test';

export type StateIacResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const forbidden = { ok: false as const, status: 403, error: 'Forbidden' };
const notFound = { ok: false as const, status: 404, error: 'Backend not found' };

export function canManageBackends(
  locals: AlertLocals,
  organizationId: string,
  action: BackendAction,
): Promise<boolean> {
  return callerCan(locals, `organization:stateiac:backends:${action}`, {
    scope: 'organization',
    organizationId,
  });
}

function failure(error: unknown): StateIacResult<never> {
  if (error instanceof StateIacValidationError) {
    return { ok: false, status: 400, error: 'Invalid backend', errors: error.errors };
  }
  if (error instanceof StateBackendNotFoundError) return notFound;
  throw error;
}

async function loadAuthorized(locals: AlertLocals, id: string, action: BackendAction) {
  const backend = await stateBackendService.get(id).catch(() => null);
  if (!backend) return notFound;
  if (!(await canManageBackends(locals, backend.organizationId, 'read'))) return notFound;
  if (action !== 'read' && !(await canManageBackends(locals, backend.organizationId, action))) {
    return forbidden;
  }
  return { ok: true as const, status: 200, data: backend };
}

/** `organizationId` of a request, checked to exist. */
export async function resolveOrganization(
  organizationId: unknown,
): Promise<StateIacResult<{ organizationId: string }>> {
  const id = typeof organizationId === 'string' ? organizationId.trim() : '';
  if (!id) return { ok: false, status: 400, error: 'organizationId is required' };
  const organization = await organizationService.getOrganization(id).catch(() => null);
  if (!organization) return { ok: false, status: 404, error: 'Organization not found' };
  return { ok: true, status: 200, data: { organizationId: id } };
}

export async function listBackends(
  locals: AlertLocals,
  organizationId: string,
): Promise<StateIacResult<{ backends: StateBackendView[] }>> {
  if (!(await canManageBackends(locals, organizationId, 'read'))) return forbidden;
  const backends = await stateBackendService.list(organizationId);
  return { ok: true, status: 200, data: { backends: backends.map((b) => b.toView()) } };
}

export async function getBackend(
  locals: AlertLocals,
  id: string,
): Promise<StateIacResult<StateBackendView>> {
  const loaded = await loadAuthorized(locals, id, 'read');
  return loaded.ok ? { ok: true, status: 200, data: loaded.data.toView() } : loaded;
}

export async function createBackend(
  locals: AlertLocals,
  organizationId: string,
  input: BackendInput,
): Promise<StateIacResult<StateBackendView>> {
  if (!(await canManageBackends(locals, organizationId, 'create'))) return forbidden;
  try {
    const backend = await stateBackendService.create(organizationId, input);
    return { ok: true, status: 201, data: backend.toView() };
  } catch (error) {
    return failure(error);
  }
}

export async function updateBackend(
  locals: AlertLocals,
  id: string,
  input: BackendInput,
): Promise<StateIacResult<StateBackendView>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  try {
    const backend = await stateBackendService.update(id, input);
    return { ok: true, status: 200, data: backend.toView() };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteBackend(
  locals: AlertLocals,
  id: string,
): Promise<StateIacResult<{ id: string }>> {
  const loaded = await loadAuthorized(locals, id, 'delete');
  if (!loaded.ok) return loaded;
  try {
    await stateBackendService.delete(id);
    return { ok: true, status: 200, data: { id } };
  } catch (error) {
    return failure(error);
  }
}

export async function testBackend(
  locals: AlertLocals,
  id: string,
): Promise<StateIacResult<BackendTestResult>> {
  const loaded = await loadAuthorized(locals, id, 'test');
  if (!loaded.ok) return loaded;
  return { ok: true, status: 200, data: await stateBackendService.test(id) };
}

export type DiscoveredPulumiProject = {
  /** `null`: legacy stacks whose project can't be found yet (no resources). */
  name: string | null;
  stacks: string[];
  binding: { projectId: string; stacks: string[] } | null;
};

export type BackendProjects =
  | {
      ok: true;
      layout: PulumiLayout;
      metaVersion: number | null;
      truncated: boolean;
      projects: DiscoveredPulumiProject[];
      /** Bindings whose Pulumi project is no longer in the bucket. */
      missing: Array<{ pulumiProject: string; projectId: string; stacks: string[] }>;
    }
  | {
      ok: false;
      error: string;
      projects: [];
      missing: Array<{ pulumiProject: string; projectId: string; stacks: string[] }>;
    };

/** Pulumi projects found in the bucket with their assignment. Needs `backends:read`. */
export async function listBackendProjects(
  locals: AlertLocals,
  id: string,
): Promise<StateIacResult<BackendProjects>> {
  const loaded = await loadAuthorized(locals, id, 'read');
  if (!loaded.ok) return loaded;
  const [discovery, bindings] = await Promise.all([
    stateBackendService.discover(id),
    stateBindingService.listByBackend(id),
  ]);
  const byProject = new Map(bindings.map((binding) => [binding.pulumiProject, binding]));
  const found = new Set<string>();
  const projects: DiscoveredPulumiProject[] = discovery.ok
    ? discovery.projects.map((project) => {
        const binding = project.name ? byProject.get(project.name) : undefined;
        if (project.name) found.add(project.name);
        return {
          name: project.name,
          stacks: project.stacks.map((stack) => stack.name),
          binding: binding ? { projectId: binding.projectId, stacks: binding.stacks } : null,
        };
      })
    : [];
  const missing = bindings
    .filter((binding) => !found.has(binding.pulumiProject))
    .map((binding) => ({
      pulumiProject: binding.pulumiProject,
      projectId: binding.projectId,
      stacks: binding.stacks,
    }));
  const data: BackendProjects = discovery.ok
    ? {
        ok: true,
        layout: discovery.layout,
        metaVersion: discovery.metaVersion,
        truncated: discovery.truncated,
        projects,
        missing,
      }
    : { ok: false, error: discovery.error, projects: [], missing };
  return { ok: true, status: 200, data };
}

export async function setBinding(
  locals: AlertLocals,
  id: string,
  pulumiProject: string,
  input: BindingInput,
): Promise<StateIacResult<{ pulumiProject: string; projectId: string; stacks: string[] }>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  try {
    const binding = await stateBindingService.set(loaded.data, pulumiProject, input);
    return {
      ok: true,
      status: 200,
      data: {
        pulumiProject: binding.pulumiProject,
        projectId: binding.projectId,
        stacks: binding.stacks,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function removeBinding(
  locals: AlertLocals,
  id: string,
  pulumiProject: string,
): Promise<StateIacResult<{ pulumiProject: string; removed: boolean }>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  const removed = await stateBindingService.remove(loaded.data, pulumiProject);
  return { ok: true, status: 200, data: { pulumiProject, removed } };
}

/** Backend fields of a JSON body or a form, credentials included only when typed. */
export function backendInputFrom(source: Record<string, unknown>): BackendInput {
  const field = (key: string) => (source[key] === undefined ? undefined : source[key]);
  const credentials =
    source.credentials && typeof source.credentials === 'object'
      ? (source.credentials as Record<string, unknown>)
      : {
          serviceAccountJson: source.serviceAccountJson,
          accessKeyId: source.accessKeyId,
          secretAccessKey: source.secretAccessKey,
          sessionToken: source.sessionToken,
        };
  return {
    name: field('name'),
    engine: field('engine'),
    provider: field('provider'),
    bucket: field('bucket'),
    prefix: field('prefix'),
    region: field('region'),
    endpoint: field('endpoint'),
    forcePathStyle: field('forcePathStyle'),
    auth: field('auth'),
    credentials,
    enabled: field('enabled'),
  };
}
