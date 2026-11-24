/**
 * Several standalone worker processes (`node src/worker/monitoring-worker.ts`, exactly what runs in
 * production) share the checks of one runtime through the internal HTTP API.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyWorkerRequest } from '#lib/server/monitoring/internal-auth';
import type { MonitorRecord } from '../domain/monitor.domain';
import { MonitoringRuntime } from './monitoring-runtime';
import { InMemoryMetricsStore, InMemoryMonitorStore } from './testing';

const TOKEN = 'distributed-test-token';
const WORKERS = 3;
const MONITORS = 30;

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );
}

describe('distributed workers', () => {
  const hits = new Map<string, number>();
  const store = new InMemoryMetricsStore();
  let target: http.Server;
  let api: http.Server;
  let runtime: MonitoringRuntime;
  const workers: ChildProcess[] = [];
  const reporters = new Set<string>();

  beforeAll(async () => {
    target = http.createServer((req, res) => {
      hits.set(req.url!, (hits.get(req.url!) ?? 0) + 1);
      res.writeHead(req.url!.startsWith('/down') ? 500 : 200).end('ok');
    });
    const targetUrl = await listen(target);

    const monitors = new InMemoryMonitorStore();
    const createdAt = new Date(Date.now() - 60_000).toISOString();
    monitors.rows = Array.from({ length: MONITORS }, (_, i): MonitorRecord => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      projectId: 'project',
      serviceId: null,
      name: `m${i}`,
      url: `${targetUrl}/${i % 10 === 0 ? 'down' : 'up'}/${i}`,
      method: 'GET',
      headerNames: [],
      secrets: null,
      intervalSeconds: 60,
      timeoutMs: 2_000,
      expectedStatus: '200-299',
      degradedThresholdMs: 0,
      confirmations: 1,
      followRedirects: true,
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    }));
    runtime = new MonitoringRuntime({
      monitors,
      store,
      decrypt: () => ({ headers: {}, body: null }),
      config: { flushSeconds: 300, hourlyRetentionDays: 30, incidentRetentionDays: 365 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });
    await runtime.start({ timers: false });
    // every monitor due right away
    for (const record of monitors.rows) runtime.monitorChanged(record);

    // the two internal endpoints, with the same auth as hooks.server.ts
    api = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const request = new Request(`http://api${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: Buffer.concat(chunks),
      });
      const denied = verifyWorkerRequest(request, { workerToken: TOKEN, internalHosts: [] });
      if (denied) return res.writeHead(denied.status).end(await denied.text());
      const body = await request.json();
      let result: unknown;
      if (req.url === '/api/internal/monitoring/lease') result = await runtime.lease(body);
      else {
        reporters.add(body.workerId);
        result = await runtime.report(body);
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    });
    const apiUrl = await listen(api);

    const entry = path.resolve(import.meta.dirname, '../../../worker/monitoring-worker.ts');
    for (let i = 0; i < WORKERS; i++) {
      workers.push(
        spawn(process.execPath, [entry], {
          env: {
            PATH: process.env.PATH,
            MONITORING_API_URL: apiUrl,
            MONITORING_WORKER_TOKEN: TOKEN,
            MONITORING_WORKER_ID: `worker-${i}`,
            MONITORING_WORKER_REGION: i === 0 ? 'eu-west' : 'us-east',
            MONITORING_WORKER_CONCURRENCY: '4',
            MONITORING_ALLOW_PRIVATE_TARGETS: 'true',
          },
          stdio: 'ignore',
        }),
      );
    }
  });

  afterAll(async () => {
    for (const worker of workers) worker.kill('SIGTERM');
    target.closeAllConnections();
    target.close();
    api.closeAllConnections();
    api.close();
  });

  it('runs every due check exactly once across the workers', async () => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const checked = [...Array(MONITORS).keys()].filter(
        (i) =>
          runtime.recentChecks(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).length > 0,
      );
      if (checked.length === MONITORS) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await runtime.settle();

    // one check per monitor: no slot was run twice by two workers
    expect([...hits.values()].reduce((a, b) => a + b, 0)).toBe(MONITORS);
    expect([...hits.values()].every((count) => count === 1)).toBe(true);
    // the work was actually shared
    expect(reporters.size).toBeGreaterThan(1);
    expect(
      runtime
        .activeWorkers()
        .map((worker) => worker.region)
        .sort(),
    ).toContain('eu-west');
    // the failing ones opened incidents (confirmations: 1)
    expect(store.incidents.filter((incident) => !incident.endedAt)).toHaveLength(MONITORS / 10);
  }, 30_000);
});
