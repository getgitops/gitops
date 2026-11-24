import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MonitoringWorker } from './worker';
import type { LeasedCheck, MonitoringTransport, ReportRequest } from './types';

describe('MonitoringWorker check logs', () => {
  let server: http.Server;
  let base = '';

  beforeAll(async () => {
    server = http.createServer((req, res) =>
      res.writeHead(req.url!.startsWith('/down') ? 503 : 200).end(),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  async function runOnce(logChecks: boolean | undefined) {
    const checks: LeasedCheck[] = ['/up?token=secret', '/down'].map((path, i) => ({
      leaseId: `lease-${i}`,
      monitorId: `monitor-${i}`,
      scheduledAt: new Date().toISOString(),
      request: {
        url: `${base}${path}`,
        method: 'GET',
        headers: { Authorization: 'Bearer secret-header' },
        body: null,
        timeoutMs: 2_000,
        expectedStatus: '200-299',
        degradedThresholdMs: 0,
        followRedirects: true,
      },
    }));
    const reported: ReportRequest[] = [];
    let leased = false;
    const transport: MonitoringTransport = {
      lease: async () => {
        const batch = leased ? [] : checks;
        leased = true;
        return { checks: batch, pollAfterMs: 250 };
      },
      report: async (request) => {
        reported.push(request);
        return { accepted: request.results.length, rejected: 0 };
      },
    };
    const lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
    const logger = {
      info: (obj: object, msg?: string) => lines.push({ level: 'info', obj: obj as never, msg }),
      warn: (obj: object, msg?: string) => lines.push({ level: 'warn', obj: obj as never, msg }),
      error: (obj: object, msg?: string) => lines.push({ level: 'error', obj: obj as never, msg }),
    };
    const worker = new MonitoringWorker({
      workerId: 'w1',
      region: 'eu',
      transport,
      concurrency: 5,
      allowPrivateTargets: true,
      logChecks,
      logger,
      reportIntervalMs: 50,
    });
    worker.start();
    await expect.poll(() => reported.flatMap((r) => r.results).length, { timeout: 5_000 }).toBe(2);
    await worker.stop();
    return lines.filter((line) => line.msg?.startsWith('[monitoring] check '));
  }

  it('logs every check by default: info when up, warn when down, never secrets', async () => {
    const lines = await runOnce(undefined);
    const up = lines.find((line) => line.obj.monitorId === 'monitor-0');
    const down = lines.find((line) => line.obj.monitorId === 'monitor-1');
    expect(up).toMatchObject({
      level: 'info',
      msg: '[monitoring] check up',
      obj: {
        status: 'up',
        httpStatus: 200,
        workerId: 'w1',
        region: 'eu',
        target: `GET ${base}/up`,
      },
    });
    expect(down).toMatchObject({
      level: 'warn',
      msg: '[monitoring] check down',
      obj: { status: 'down', httpStatus: 503, cause: 'unexpected_status' },
    });
    expect(JSON.stringify(lines)).not.toContain('secret');
  });

  it('stays quiet with logChecks: false', async () => {
    expect(await runOnce(false)).toHaveLength(0);
  });
});
