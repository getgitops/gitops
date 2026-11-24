import { randomUUID } from 'node:crypto';
import { isValidExpectedStatus } from '#lib/monitoring/expected-status';
import type { HttpCheckResult } from '#lib/monitoring/http-check';
import { isBlockedHostname } from '#lib/monitoring/target-guard';
import { MONITOR_METHODS, type CheckRequest, type MonitorMethod } from '#lib/monitoring/types';
import {
  toMonitorView,
  type MonitorRecord,
  type MonitorSecrets,
  type MonitorView,
} from '../domain/monitor.domain';
import { MONITOR_DEFAULTS, MONITOR_LIMITS } from '../domain/monitor-limits.data';
import type { MonitorStore } from '../infrastructure/repositories/monitor.repository';

/** A header row from the form or the API. `value: null` keeps the stored value of that header. */
export type MonitorHeaderInput = { name: string; value: string | null };

export type MonitorInput = {
  name?: unknown;
  url?: unknown;
  method?: unknown;
  serviceId?: unknown;
  headers?: MonitorHeaderInput[];
  /** `undefined` keeps the stored body. */
  body?: string | null;
  intervalSeconds?: unknown;
  timeoutMs?: unknown;
  expectedStatus?: unknown;
  degradedThresholdMs?: unknown;
  confirmations?: unknown;
  followRedirects?: unknown;
  enabled?: unknown;
};

/** Field → error code (`required`, `too_long`, `invalid_url`…), see `monitoring.errors.*`. */
export class MonitorValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super('Invalid monitor');
  }
}

export class MonitorNotFoundError extends Error {
  constructor() {
    super('Monitor not found');
  }
}

export type MonitorServiceDeps = {
  store: MonitorStore;
  services: { getProjectIdOf(serviceId: string): Promise<string | null> };
  encrypt: (monitorId: string, secrets: MonitorSecrets) => string | null;
  decrypt: (monitorId: string, stored: string | null) => MonitorSecrets;
  runCheck: (request: CheckRequest) => Promise<HttpCheckResult>;
  allowPrivateTargets: () => boolean;
  onChanged?: (record: MonitorRecord) => void;
  onDeleted?: (monitorId: string) => void;
};

type Normalized = Omit<
  MonitorRecord,
  'id' | 'projectId' | 'secrets' | 'createdAt' | 'updatedAt'
> & {
  secrets: MonitorSecrets;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function integer(
  value: unknown,
  fallback: number,
  range: { min: number; max: number },
  field: string,
  errors: Record<string, string>,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
    errors[field] = 'out_of_range';
    return fallback;
  }
  return parsed;
}

function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === 'on' || value === 'true' || value === '1';
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export class MonitorService {
  constructor(private readonly deps: MonitorServiceDeps) {}

  async listByProject(projectId: string): Promise<MonitorView[]> {
    return (await this.deps.store.listByProject(projectId)).map((record) => this.view(record));
  }

  async listByService(projectId: string, serviceId: string): Promise<MonitorView[]> {
    return (await this.listByProject(projectId)).filter(
      (monitor) => monitor.serviceId === serviceId,
    );
  }

  /** Records of a project (server-side use: stats, runtime). */
  listRecordsByProject(projectId: string): Promise<MonitorRecord[]> {
    return this.deps.store.listByProject(projectId);
  }

  async getRecord(projectId: string, id: string): Promise<MonitorRecord> {
    const record = await this.deps.store.findById(id);
    if (!record || record.projectId !== projectId) throw new MonitorNotFoundError();
    return record;
  }

  async get(projectId: string, id: string): Promise<MonitorView> {
    return this.view(await this.getRecord(projectId, id));
  }

  async create(projectId: string, input: MonitorInput): Promise<MonitorView> {
    const normalized = await this.normalize(projectId, input, null);
    const id = randomUUID();
    const { secrets, ...fields } = normalized;
    const record = await this.deps.store.create({
      id,
      projectId,
      ...fields,
      secrets: this.deps.encrypt(id, secrets),
    });
    this.deps.onChanged?.(record);
    return this.view(record);
  }

  async update(projectId: string, id: string, input: MonitorInput): Promise<MonitorView> {
    const existing = await this.getRecord(projectId, id);
    const normalized = await this.normalize(projectId, input, existing);
    const { secrets, ...fields } = normalized;
    const record = await this.deps.store.update(id, {
      ...fields,
      secrets: this.deps.encrypt(id, secrets),
    });
    this.deps.onChanged?.(record);
    return this.view(record);
  }

  async setEnabled(projectId: string, id: string, enabled: boolean): Promise<MonitorView> {
    await this.getRecord(projectId, id);
    const record = await this.deps.store.update(id, { enabled });
    this.deps.onChanged?.(record);
    return this.view(record);
  }

  async delete(projectId: string, id: string): Promise<void> {
    await this.getRecord(projectId, id);
    await this.deps.store.delete(id);
    this.deps.onDeleted?.(id);
  }

  /**
   * Runs the check described by `input` once and returns what happened, without saving anything.
   * With `existingId`, header values left empty and the body when omitted come from that monitor.
   */
  async test(
    projectId: string,
    input: MonitorInput,
    existingId?: string | null,
  ): Promise<HttpCheckResult> {
    const existing = existingId ? await this.getRecord(projectId, existingId) : null;
    const normalized = await this.normalize(projectId, input, existing, { forTest: true });
    return this.deps.runCheck({
      url: normalized.url,
      method: normalized.method,
      headers: normalized.secrets.headers,
      body: normalized.secrets.body,
      timeoutMs: normalized.timeoutMs,
      expectedStatus: normalized.expectedStatus,
      degradedThresholdMs: normalized.degradedThresholdMs,
      followRedirects: normalized.followRedirects,
    });
  }

  private view(record: MonitorRecord): MonitorView {
    let hasBody: boolean;
    try {
      hasBody = Boolean(this.deps.decrypt(record.id, record.secrets).body);
    } catch {
      // unreadable secrets (rotated key): the monitor is still listed
      hasBody = false;
    }
    return toMonitorView(record, hasBody);
  }

  private async normalize(
    projectId: string,
    input: MonitorInput,
    existing: MonitorRecord | null,
    options: { forTest?: boolean } = {},
  ): Promise<Normalized> {
    const errors: Record<string, string> = {};
    const defaults = existing ?? MONITOR_DEFAULTS;

    const name = text(input.name ?? existing?.name);
    if (!name && !options.forTest) errors.name = 'required';
    else if (name.length > MONITOR_LIMITS.nameMaxLength) errors.name = 'too_long';

    const url = text(input.url ?? existing?.url);
    if (!url) errors.url = 'required';
    else if (url.length > MONITOR_LIMITS.urlMaxLength) errors.url = 'too_long';
    else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.url = 'invalid_url';
        else if (!this.deps.allowPrivateTargets() && isBlockedHostname(parsed.hostname)) {
          errors.url = 'private_target';
        }
      } catch {
        errors.url = 'invalid_url';
      }
    }

    const method = (text(input.method) || defaults.method).toUpperCase() as MonitorMethod;
    if (!MONITOR_METHODS.includes(method)) errors.method = 'invalid_method';

    const intervalSeconds = integer(
      input.intervalSeconds,
      defaults.intervalSeconds,
      MONITOR_LIMITS.intervalSeconds,
      'intervalSeconds',
      errors,
    );
    const timeoutMs = integer(
      input.timeoutMs,
      defaults.timeoutMs,
      MONITOR_LIMITS.timeoutMs,
      'timeoutMs',
      errors,
    );
    const degradedThresholdMs = integer(
      input.degradedThresholdMs,
      defaults.degradedThresholdMs,
      MONITOR_LIMITS.degradedThresholdMs,
      'degradedThresholdMs',
      errors,
    );
    const confirmations = integer(
      input.confirmations,
      defaults.confirmations,
      MONITOR_LIMITS.confirmations,
      'confirmations',
      errors,
    );

    const expectedStatus = text(input.expectedStatus) || defaults.expectedStatus;
    if (!isValidExpectedStatus(expectedStatus)) errors.expectedStatus = 'invalid_expected_status';

    let serviceId: string | null = existing?.serviceId ?? null;
    if (input.serviceId !== undefined) {
      serviceId = text(input.serviceId) || null;
      if (serviceId && (await this.deps.services.getProjectIdOf(serviceId)) !== projectId) {
        errors.serviceId = 'service_not_found';
      }
    }

    const previous = existing
      ? this.deps.decrypt(existing.id, existing.secrets)
      : { headers: {}, body: null };
    const headers: Record<string, string> = {};
    const rows =
      input.headers ?? Object.keys(previous.headers).map((key) => ({ name: key, value: null }));
    const filled = rows.filter((row) => text(row.name) || (row.value ?? '').trim());
    if (filled.length > MONITOR_LIMITS.maxHeaders) errors.headers = 'too_many_headers';
    filled.forEach((row, index) => {
      const key = text(row.name);
      if (!key || key.length > MONITOR_LIMITS.headerNameMaxLength || !HEADER_NAME.test(key)) {
        errors[`headers.${index}.name`] = 'invalid_header';
        return;
      }
      if (Object.keys(headers).some((other) => other.toLowerCase() === key.toLowerCase())) {
        errors[`headers.${index}.name`] = 'duplicate_header';
        return;
      }
      const value = row.value === null || row.value === '' ? previous.headers[key] : row.value;
      if (value === undefined) {
        errors[`headers.${index}.value`] = 'required';
        return;
      }
      if (value.length > MONITOR_LIMITS.headerValueMaxLength || /[\r\n]/.test(value)) {
        errors[`headers.${index}.value`] = 'invalid_header';
        return;
      }
      headers[key] = value;
    });

    let body = input.body === undefined ? previous.body : input.body;
    if (body !== null && body.length > MONITOR_LIMITS.bodyMaxLength) errors.body = 'too_long';
    if (method === 'GET' || method === 'HEAD') body = null;
    if (body === '') body = null;

    if (Object.keys(errors).length > 0) throw new MonitorValidationError(errors);

    return {
      serviceId,
      name: name || 'test',
      url,
      method,
      headerNames: Object.keys(headers),
      secrets: { headers, body },
      intervalSeconds,
      timeoutMs,
      expectedStatus,
      degradedThresholdMs,
      confirmations,
      followRedirects: flag(input.followRedirects, defaults.followRedirects),
      enabled: flag(input.enabled, defaults.enabled),
    };
  }
}
