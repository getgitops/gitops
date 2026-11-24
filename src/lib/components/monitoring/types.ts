/** Client-side shapes of the monitoring pages (serialized from `#modules/monitoring`). */
import type { CheckOutcome, CheckPreview } from '#lib/monitoring/types';

export type BarData = {
  start: string;
  end: string;
  status: 'up' | 'degraded' | 'down' | 'none';
  uptime: number | null;
  checks: number;
  downSeconds: number;
  degradedSeconds: number;
  latencyAvg: number | null;
  latencyP95: number | null;
};

export type IncidentData = {
  id: string;
  monitorId: string;
  status: 'down' | 'degraded';
  cause: string | null;
  httpStatus: number | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  failedChecks: number;
};

export type MonitorData = {
  id: string;
  projectId: string;
  serviceId: string | null;
  name: string;
  url: string;
  displayUrl: string;
  method: string;
  headerNames: string[];
  hasBody: boolean;
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

export type StatsData = {
  monitorId: string;
  status: string;
  since: string | null;
  incidentId: string | null;
  lastCheck: CheckOutcome | null;
  uptime: { h24: number | null; d7: number | null; d30: number | null; d90: number | null };
  latency24h: { avg: number | null; p95: number | null; max: number | null };
  hourlyBars: BarData[];
  dailyBars: BarData[];
  openIncident: IncidentData | null;
};

export type MonitorRowData = { monitor: MonitorData; stats: StatsData | null };

export type ServiceOption = { id: string; name: string; slug: string };

export type TestResult = { outcome: CheckOutcome; preview: CheckPreview | null };

/** What the form shows (from the stored monitor or from the last submit). */
export type MonitorFormValues = {
  name: string;
  url: string;
  method: string;
  serviceId: string;
  headers: { name: string; value: string }[];
  body: string;
  intervalSeconds: string;
  timeoutMs: string;
  expectedStatus: string;
  degradedThresholdMs: string;
  confirmations: string;
  followRedirects: boolean;
  enabled: boolean;
};
