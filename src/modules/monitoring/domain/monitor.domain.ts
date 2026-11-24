import type { MonitorMethod } from '#lib/monitoring/types';

/** A monitor as stored, secrets still encrypted. Server-side only. */
export type MonitorRecord = {
  id: string;
  projectId: string;
  serviceId: string | null;
  name: string;
  url: string;
  method: MonitorMethod;
  headerNames: string[];
  /** Encrypted `{ headers, body }`, see `monitor-secrets.ts`. */
  secrets: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatus: string;
  degradedThresholdMs: number;
  confirmations: number;
  followRedirects: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** What the UI and the API return: header names only, never their values or the body. */
export type MonitorView = Omit<MonitorRecord, 'secrets'> & {
  hasBody: boolean;
  /** URL without credentials or query string, safe for lists, emails and events. */
  displayUrl: string;
};

/** Decrypted request parts. */
export type MonitorSecrets = {
  headers: Record<string, string>;
  body: string | null;
};

export function toMonitorRecord(row: Record<string, unknown>): MonitorRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    serviceId: (row.serviceId as string | null) ?? null,
    name: String(row.name ?? ''),
    url: String(row.url ?? ''),
    method: (row.method as MonitorMethod) ?? 'GET',
    headerNames: Array.isArray(row.headerNames) ? (row.headerNames as string[]) : [],
    secrets: (row.secrets as string | null) ?? null,
    intervalSeconds: Number(row.intervalSeconds ?? 60),
    timeoutMs: Number(row.timeoutMs ?? 10_000),
    expectedStatus: String(row.expectedStatus ?? '200-299'),
    degradedThresholdMs: Number(row.degradedThresholdMs ?? 0),
    confirmations: Number(row.confirmations ?? 2),
    followRedirects: row.followRedirects !== false,
    enabled: row.enabled !== false,
    createdAt: String(row.createdAt ?? new Date(0).toISOString()),
    updatedAt: String(row.updatedAt ?? new Date(0).toISOString()),
  };
}

/** `https://api.example.com/health` from `https://user:pw@api.example.com/health?token=…`. */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

export function toMonitorView(record: MonitorRecord, hasBody: boolean): MonitorView {
  const { secrets: _secrets, ...rest } = record;
  return { ...rest, hasBody, displayUrl: displayUrl(record.url) };
}
