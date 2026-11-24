/**
 * Standalone monitoring worker: `node src/worker/monitoring-worker.ts` (`bun run worker`).
 *
 * Stateless and horizontally scalable: run as many replicas as needed, in any service or region
 * that reaches the GitOps server over the private network. Needs no database and no dependency
 * beyond Node itself.
 *
 *   MONITORING_API_URL                 GitOps base URL, e.g. http://gitops.railway.internal:3000
 *   MONITORING_WORKER_TOKEN            same value as on the server
 *   MONITORING_WORKER_ID               defaults to <hostname>-<pid>
 *   MONITORING_WORKER_REGION           optional label (eu-west, us-east…)
 *   MONITORING_WORKER_CONCURRENCY      checks in flight at once (default 50)
 *   MONITORING_ALLOW_PRIVATE_TARGETS   `true` to let checks reach private addresses
 *   MONITORING_CHECK_LOGS              `false` to stop logging every check (default on)
 */
import os from 'node:os';
import process from 'node:process';
import { HttpMonitoringTransport } from '../lib/monitoring/http-transport.ts';
import { MonitoringWorker, type WorkerLogger } from '../lib/monitoring/worker.ts';

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function log(level: 'info' | 'warn' | 'error') {
  return (obj: object, msg?: string) =>
    console[level === 'info' ? 'log' : level](
      JSON.stringify({ level, time: new Date().toISOString(), msg, ...obj }),
    );
}

const logger: WorkerLogger = { info: log('info'), warn: log('warn'), error: log('error') };

const baseUrl = env('MONITORING_API_URL');
const token = env('MONITORING_WORKER_TOKEN');
if (!baseUrl || !token) {
  logger.error({}, 'MONITORING_API_URL and MONITORING_WORKER_TOKEN are required');
  process.exit(1);
}

const concurrency = Number(env('MONITORING_WORKER_CONCURRENCY') ?? 50);

const worker = new MonitoringWorker({
  workerId: env('MONITORING_WORKER_ID') ?? `${os.hostname()}-${process.pid}`,
  region: env('MONITORING_WORKER_REGION'),
  concurrency: Number.isInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 500) : 50,
  allowPrivateTargets: env('MONITORING_ALLOW_PRIVATE_TARGETS') === 'true',
  logChecks: env('MONITORING_CHECK_LOGS')?.toLowerCase() !== 'false',
  transport: new HttpMonitoringTransport({ baseUrl, token }),
  logger,
});

worker.start();

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void worker.stop().finally(() => process.exit(0));
  });
}
