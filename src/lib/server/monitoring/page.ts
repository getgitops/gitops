import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import { codeReportService } from '#modules/code-report';
import { projectService } from '#modules/projects';
import { MONITOR_METHODS } from '#lib/monitoring/types';
import {
  MONITOR_DEFAULTS,
  MONITOR_INTERVAL_OPTIONS,
  MonitorNotFoundError,
  MonitorValidationError,
  monitorService,
  monitoringInfo,
  monitoringRuntime,
  type MonitorInput,
  type MonitorView,
} from '#modules/monitoring';

type ProjectLike = {
  id: string;
  slug: string | null;
  name: string;
  modules?: { monitoring?: boolean } | null;
  organization?: { id: string; slug?: string | null } | null;
};

export type MonitoringPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canTest: boolean;
};

export type ServiceOption = { id: string; name: string; slug: string };

type Locals = App.Locals;

async function can(locals: Locals, project: ProjectLike, action: string): Promise<boolean> {
  return cancanService.canSessionUser(
    locals.user as never,
    `project:monitoring:monitors:${action}`,
    {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    },
  );
}

export async function monitoringPermissions(
  locals: Locals,
  project: ProjectLike,
): Promise<MonitoringPermissions> {
  const [canRead, canCreate, canUpdate, canDelete, canTest] = await Promise.all(
    ['read', 'create', 'update', 'delete', 'test'].map((action) => can(locals, project, action)),
  );
  return { canRead, canCreate, canUpdate, canDelete, canTest: canTest || canCreate || canUpdate };
}

/** The project of a monitoring page, once the module is enabled and the caller may read it. */
export async function requireMonitoring(event: {
  locals: Locals;
  parent: () => Promise<Record<string, unknown>>;
}): Promise<{ project: ProjectLike; permissions: MonitoringPermissions }> {
  const { project } = (await event.parent()) as { project: ProjectLike };
  if (!project?.modules?.monitoring) throw error(404, 'Monitoring is not enabled in this project');
  const permissions = await monitoringPermissions(event.locals, project);
  if (!permissions.canRead) throw error(403, 'Forbidden');
  return { project, permissions };
}

export function monitoringBase(project: ProjectLike): string {
  return `/org/${project.organization?.slug ?? ''}/projects/${project.slug ?? ''}/monitoring`;
}

export async function serviceOptions(projectId: string): Promise<ServiceOption[]> {
  const services = (await codeReportService
    .listByProject(projectId)
    .catch(() => [])) as ServiceOption[];
  return services.map((service) => ({ id: service.id, name: service.name, slug: service.slug }));
}

/** Monitors of the project with their live stats, plus the module info for the header. */
export async function loadMonitorsWithStats(projectId: string) {
  const records = await monitorService.listRecordsByProject(projectId);
  const [monitors, stats, services] = await Promise.all([
    monitorService.listByProject(projectId),
    monitoringRuntime.stats(records).catch(() => []),
    serviceOptions(projectId),
  ]);
  const statsById = new Map(stats.map((entry) => [entry.monitorId, entry]));
  return {
    monitors: monitors.map((monitor) => ({ monitor, stats: statsById.get(monitor.id) ?? null })),
    services,
    info: monitoringInfo(),
  };
}

/** Valores iniciales del formulario de alta (página /monitors/new y modal "Nuevo monitor"). */
export function newMonitorForm(services: ServiceOption[], presetServiceId = '') {
  return {
    methods: MONITOR_METHODS,
    intervals: MONITOR_INTERVAL_OPTIONS,
    values: {
      name: '',
      url: '',
      method: MONITOR_DEFAULTS.method,
      serviceId: services.some((service) => service.id === presetServiceId) ? presetServiceId : '',
      headers: [] as { name: string; value: string }[],
      body: '',
      intervalSeconds: String(MONITOR_DEFAULTS.intervalSeconds),
      timeoutMs: String(MONITOR_DEFAULTS.timeoutMs),
      expectedStatus: MONITOR_DEFAULTS.expectedStatus,
      degradedThresholdMs: String(MONITOR_DEFAULTS.degradedThresholdMs),
      confirmations: String(MONITOR_DEFAULTS.confirmations),
      followRedirects: MONITOR_DEFAULTS.followRedirects,
      enabled: true,
    },
  };
}

/** Form fields → service input. `editing`: an empty secret field keeps the stored value. */
export function parseMonitorForm(form: FormData, editing: boolean): MonitorInput {
  const names = form.getAll('headerName').map(String);
  const values = form.getAll('headerValue').map(String);
  const headers = names.map((name, index) => {
    const value = values[index] ?? '';
    return { name, value: value === '' ? null : value };
  });

  const bodyText = String(form.get('body') ?? '');
  let body: string | null | undefined;
  if (bodyText !== '') body = bodyText;
  else if (form.get('clearBody') === 'on' || !editing) body = null;
  else body = undefined;

  return {
    name: form.get('name'),
    url: form.get('url'),
    method: form.get('method'),
    serviceId: form.get('serviceId') ?? '',
    headers,
    body,
    intervalSeconds: form.get('intervalSeconds'),
    timeoutMs: form.get('timeoutMs'),
    expectedStatus: form.get('expectedStatus'),
    degradedThresholdMs: form.get('degradedThresholdMs'),
    confirmations: form.get('confirmations'),
    // unchecked checkboxes are not sent at all: the hidden `*Present` field says the form had them
    followRedirects: form.get('followRedirects') === 'on',
    enabled: form.has('enabledPresent') ? form.get('enabled') === 'on' : undefined,
  };
}

/** What the form shows again after a failed save or a test (never the stored secret values). */
export function formValues(form: FormData) {
  return {
    name: String(form.get('name') ?? ''),
    url: String(form.get('url') ?? ''),
    method: String(form.get('method') ?? 'GET'),
    serviceId: String(form.get('serviceId') ?? ''),
    headers: form.getAll('headerName').map((name, index) => ({
      name: String(name),
      value: String(form.getAll('headerValue')[index] ?? ''),
    })),
    body: String(form.get('body') ?? ''),
    intervalSeconds: String(form.get('intervalSeconds') ?? ''),
    timeoutMs: String(form.get('timeoutMs') ?? ''),
    expectedStatus: String(form.get('expectedStatus') ?? ''),
    degradedThresholdMs: String(form.get('degradedThresholdMs') ?? ''),
    confirmations: String(form.get('confirmations') ?? ''),
    followRedirects: form.get('followRedirects') === 'on',
    enabled: form.has('enabledPresent') ? form.get('enabled') === 'on' : true,
  };
}

function validationFailure(err: unknown, form: FormData, intent: 'save' | 'test') {
  if (err instanceof MonitorValidationError) {
    return fail(400, { intent, errors: err.errors, values: formValues(form) });
  }
  if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
  throw err;
}

type ActionEvent = RequestEvent & { parent?: never };

async function projectFor(event: ActionEvent): Promise<ProjectLike> {
  // actions don't run the layout loads: resolve the project here; the permission check in
  // `guard` is what confines the caller to it
  const project = (await projectService
    .getProjectBySlug(event.params.slug!)
    .catch(() => null)) as ProjectLike | null;
  if (!project?.modules?.monitoring) throw error(404, 'Monitoring is not enabled in this project');
  return project;
}

async function guard(event: ActionEvent, action: keyof MonitoringPermissions) {
  const project = await projectFor(event);
  const permissions = await monitoringPermissions(event.locals, project);
  if (!permissions[action]) throw error(403, 'Forbidden');
  return project;
}

/** Form actions shared by the new, detail and edit pages. `monitorId` comes from the route. */
export const monitorActions = {
  save: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const monitorId = event.params.id ?? null;
    const project = await guard(event, monitorId ? 'canUpdate' : 'canCreate');
    let saved: MonitorView;
    try {
      saved = monitorId
        ? await monitorService.update(project.id, monitorId, parseMonitorForm(form, true))
        : await monitorService.create(project.id, parseMonitorForm(form, false));
    } catch (err) {
      return validationFailure(err, form, 'save');
    }
    throw redirect(303, `${monitoringBase(project)}/monitors/${saved.id}`);
  },

  test: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const monitorId = event.params.id ?? null;
    const project = await guard(event, 'canTest');
    try {
      const result = await monitorService.test(
        project.id,
        parseMonitorForm(form, Boolean(monitorId)),
        monitorId,
      );
      return { intent: 'test' as const, test: result, values: formValues(form) };
    } catch (err) {
      return validationFailure(err, form, 'test');
    }
  },

  /** "Run now" on the detail page: tests the stored monitor as it is. */
  testSaved: async (event: ActionEvent) => {
    const monitorId = event.params.id!;
    const project = await guard(event, 'canTest');
    try {
      const result = await monitorService.test(project.id, {}, monitorId);
      return { intent: 'test' as const, test: result };
    } catch (err) {
      if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
      throw err;
    }
  },

  toggle: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const monitorId = String(form.get('id') ?? event.params.id ?? '');
    const project = await guard(event, 'canUpdate');
    try {
      await monitorService.setEnabled(project.id, monitorId, form.get('enabled') === 'true');
    } catch (err) {
      if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
      throw err;
    }
    return { intent: 'toggle' as const };
  },

  delete: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const monitorId = String(form.get('id') ?? event.params.id ?? '');
    const project = await guard(event, 'canDelete');
    try {
      await monitorService.delete(project.id, monitorId);
    } catch (err) {
      if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
      throw err;
    }
    throw redirect(303, `${monitoringBase(project)}/monitors`);
  },
};
