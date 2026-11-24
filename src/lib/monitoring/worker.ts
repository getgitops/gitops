/**
 * Stateless check worker. It only talks to a `MonitoringTransport`:
 *
 *   loop: lease(capacity = free slots) → run each check (bounded concurrency) → report in batches
 *
 * Any number of workers can run at once, in this process (embedded mode) or anywhere that reaches
 * the internal API. The scheduler hands every due check to exactly one lease, and a lease that is
 * never reported expires and is handed to another worker.
 */
import { runHttpCheck } from './http-check.ts';
import type { CheckOutcome, CheckReport, LeasedCheck, MonitoringTransport } from './types.ts';

export type WorkerLogger = {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
};

export type MonitoringWorkerOptions = {
  workerId: string;
  region: string | null;
  transport: MonitoringTransport;
  /** Checks in flight at once. */
  concurrency: number;
  allowPrivateTargets: boolean;
  /** Log every finished check (`MONITORING_CHECK_LOGS`, default on). */
  logChecks?: boolean;
  logger?: WorkerLogger;
  /** Batch reports for at most this long. */
  reportIntervalMs?: number;
};

const MAX_BACKOFF_MS = 30_000;
const MAX_BUFFERED_REPORTS = 2_000;

const silentLogger: WorkerLogger = { info() {}, warn() {}, error() {} };

export class MonitoringWorker {
  private readonly options: MonitoringWorkerOptions;
  private readonly log: WorkerLogger;
  private running = false;
  private inFlight = 0;
  private pendingReports: CheckReport[] = [];
  private loopPromise: Promise<void> | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private wake: (() => void) | null = null;
  private reporting: Promise<void> | null = null;

  constructor(options: MonitoringWorkerOptions) {
    this.options = options;
    this.log = options.logger ?? silentLogger;
  }

  get id(): string {
    return this.options.workerId;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reportTimer = setInterval(
      () => void this.flushReports(),
      this.options.reportIntervalMs ?? 1_000,
    );
    this.reportTimer.unref?.();
    this.loopPromise = this.loop();
    this.log.info(
      {
        workerId: this.options.workerId,
        region: this.options.region,
        concurrency: this.options.concurrency,
      },
      '[monitoring] worker started',
    );
  }

  /** Stops leasing, waits for the checks in flight and reports them. */
  async stop(timeoutMs = 15_000): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.wake?.();
    const drained = (async () => {
      await this.loopPromise;
      while (this.inFlight > 0) await sleep(100);
      if (this.reportTimer) clearInterval(this.reportTimer);
      await this.flushReports();
    })();
    await Promise.race([drained, sleep(timeoutMs)]);
    this.log.info({ workerId: this.options.workerId }, '[monitoring] worker stopped');
  }

  private async loop(): Promise<void> {
    let backoff = 1_000;
    while (this.running) {
      const free = this.options.concurrency - this.inFlight;
      if (free <= 0) {
        await this.idle(250);
        continue;
      }
      try {
        const { checks, pollAfterMs } = await this.options.transport.lease({
          workerId: this.options.workerId,
          region: this.options.region,
          capacity: free,
        });
        backoff = 1_000;
        for (const check of checks) this.run(check);
        if (checks.length === 0) await this.idle(clamp(pollAfterMs, 250, 10_000));
      } catch (err) {
        this.log.warn({ err: describe(err), retryInMs: backoff }, '[monitoring] lease failed');
        await this.idle(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  private run(check: LeasedCheck): void {
    this.inFlight++;
    void runHttpCheck(check.request, { allowPrivateTargets: this.options.allowPrivateTargets })
      .then(({ outcome }) => {
        if (this.options.logChecks ?? true) this.logCheck(check, outcome);
        this.pendingReports.push({ leaseId: check.leaseId, monitorId: check.monitorId, outcome });
        if (this.pendingReports.length >= 100) void this.flushReports();
      })
      .catch((err) => {
        this.log.error(
          { err: describe(err), monitorId: check.monitorId },
          '[monitoring] check crashed',
        );
      })
      .finally(() => {
        this.inFlight--;
        this.wake?.();
      });
  }

  /** `up` at info, `degraded`/`down` at warn. Never the query string or header values. */
  private logCheck(check: LeasedCheck, outcome: CheckOutcome): void {
    const entry = {
      workerId: this.options.workerId,
      region: this.options.region,
      monitorId: check.monitorId,
      target: `${check.request.method} ${safeTarget(check.request.url)}`,
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      latencyMs: outcome.latencyMs,
      ...(outcome.cause ? { cause: outcome.cause, error: outcome.error } : {}),
    };
    if (outcome.status === 'up') this.log.info(entry, '[monitoring] check up');
    else this.log.warn(entry, `[monitoring] check ${outcome.status}`);
  }

  private flushReports(): Promise<void> {
    if (this.reporting) return this.reporting;
    if (this.pendingReports.length === 0) return Promise.resolve();
    const batch = this.pendingReports;
    this.pendingReports = [];
    this.reporting = this.options.transport
      .report({ workerId: this.options.workerId, region: this.options.region, results: batch })
      .then(({ rejected }) => {
        if (rejected > 0) {
          this.log.warn(
            { rejected },
            '[monitoring] some results arrived after their lease expired',
          );
        }
      })
      .catch((err) => {
        // keep them for the next flush; past the cap the oldest go (their leases expired anyway)
        this.pendingReports = [...batch, ...this.pendingReports].slice(-MAX_BUFFERED_REPORTS);
        this.log.warn(
          { err: describe(err), buffered: this.pendingReports.length },
          '[monitoring] report failed',
        );
      })
      .finally(() => {
        this.reporting = null;
      });
    return this.reporting;
  }

  private idle(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = () => {
        this.wake = null;
        done();
      };
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

/** `https://api.example.com/health` from a URL that may carry credentials or a token query. */
function safeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
