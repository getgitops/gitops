import { json } from '@sveltejs/kit';
import type { CheckOutcome, CheckReport, LeaseRequest, ReportRequest } from '#lib/monitoring/types';

const STATUSES = new Set(['up', 'degraded', 'down']);
const MAX_RESULTS = 1_000;

export function notReady(): Response {
  return json(
    { error: 'Monitoring is starting' },
    { status: 503, headers: { 'retry-after': '5' } },
  );
}

export function badRequest(error: string): Response {
  return json({ error }, { status: 400 });
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const value = await request.json().catch(() => null);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function workerFields(input: Record<string, unknown>) {
  const workerId = typeof input.workerId === 'string' ? input.workerId.trim().slice(0, 200) : '';
  const region =
    typeof input.region === 'string' && input.region.trim()
      ? input.region.trim().slice(0, 64)
      : null;
  return workerId ? { workerId, region } : null;
}

export async function parseLeaseRequest(request: Request): Promise<LeaseRequest | null> {
  const input = await body(request);
  if (!input) return null;
  const worker = workerFields(input);
  const capacity = Number(input.capacity);
  if (!worker || !Number.isInteger(capacity) || capacity < 0 || capacity > 1_000) return null;
  return { ...worker, capacity };
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function parseOutcome(value: unknown): CheckOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.status !== 'string' || !STATUSES.has(o.status)) return null;
  const startedAt = text(o.startedAt, 40);
  const endedAt = text(o.endedAt, 40);
  if (!startedAt || Number.isNaN(Date.parse(startedAt)) || !endedAt) return null;
  const latencyMs = Number(o.latencyMs);
  const httpStatus =
    o.httpStatus === null || o.httpStatus === undefined ? null : Number(o.httpStatus);
  return {
    status: o.status as CheckOutcome['status'],
    cause: (text(o.cause, 40) as CheckOutcome['cause']) ?? null,
    httpStatus: httpStatus !== null && Number.isInteger(httpStatus) ? httpStatus : null,
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : 0,
    error: text(o.error, 300),
    startedAt: new Date(startedAt).toISOString(),
    endedAt,
  };
}

export async function parseReportRequest(request: Request): Promise<ReportRequest | null> {
  const input = await body(request);
  if (!input || !Array.isArray(input.results) || input.results.length > MAX_RESULTS) return null;
  const worker = workerFields(input);
  if (!worker) return null;
  const results: CheckReport[] = [];
  for (const item of input.results as unknown[]) {
    const r = item as Record<string, unknown>;
    const outcome = parseOutcome(r?.outcome);
    if (typeof r?.leaseId !== 'string' || typeof r?.monitorId !== 'string' || !outcome) continue;
    results.push({ leaseId: r.leaseId, monitorId: r.monitorId, outcome });
  }
  return { ...worker, results };
}
