import os from 'node:os';
import { runHttpCheck } from '#lib/monitoring/http-check';
import type { CheckRequest } from '#lib/monitoring/types';
import { MonitoringWorker } from '#lib/monitoring/worker';
import { eventBus } from '#lib/server/events';
import { getGitDb } from '#lib/server/gitdb';
import type { CachedGitDb } from '#lib/server/gitdb/cached-client';
import { startSecondaryGitDb } from '#lib/server/gitdb/secondary';
import { createLogger } from '#lib/server/logger';
import { codeReportService } from '../code-report';
import { projectService } from '../projects';
import { MonitorService } from './application/monitor.service';
import { MonitoringRuntime } from './application/monitoring-runtime';
import { readMonitoringConfig, readMonitoringRepositoryConfig } from './infrastructure/config';
import {
  decryptMonitorSecrets,
  encryptMonitorSecrets,
} from './infrastructure/crypto/monitor-secrets';
import { MonitorRepository } from './infrastructure/repositories/monitor.repository';
import { MonitoringStoreRepository } from './infrastructure/repositories/monitoring-store.repository';

const log = createLogger('monitoring');

type MonitoringSlot = {
  runtime: MonitoringRuntime;
  metricsDb: CachedGitDb | null;
  usesDedicatedRepository: boolean;
  worker: MonitoringWorker | null;
  startup: Promise<void> | null;
  subscribed: boolean;
};

const SLOT_KEY = Symbol.for('gitops.monitoring');
type GlobalWithMonitoring = typeof globalThis & { [SLOT_KEY]?: MonitoringSlot };

const monitorRepository = new MonitorRepository();

function metricsDb(): CachedGitDb {
  // the dedicated repository once started; the main GitDB otherwise
  return slot.metricsDb ?? getGitDb();
}

// an invalid MONITORING_* value must not take the whole server down: log it, use the defaults
const config = (() => {
  try {
    return readMonitoringConfig();
  } catch (error) {
    log.error({ err: error }, '[monitoring] invalid configuration, using defaults');
    return {
      workerToken: null,
      internalHosts: [],
      embeddedWorker: true,
      embeddedWorkerConcurrency: 20,
      allowPrivateTargets: false,
      checkLogs: true,
      flushSeconds: 300,
      hourlyRetentionDays: 30,
      incidentRetentionDays: 365,
    };
  }
})();

// one runtime per process: HMR re-evaluating this module must keep the schedule and the counters
const slot: MonitoringSlot = ((globalThis as GlobalWithMonitoring)[SLOT_KEY] ??= {
  runtime: new MonitoringRuntime({
    monitors: monitorRepository,
    store: new MonitoringStoreRepository(() => metricsDb()),
    decrypt: (record) => decryptMonitorSecrets(record.id, record.secrets),
    config,
    logger: log,
    events: eventBus,
    projects: projectService,
  }),
  metricsDb: null,
  usesDedicatedRepository: false,
  worker: null,
  startup: null,
  subscribed: false,
});

export const monitoringRuntime = slot.runtime;

function runCheck(request: CheckRequest) {
  return runHttpCheck(request, { allowPrivateTargets: config.allowPrivateTargets, preview: true });
}

export const monitorService = new MonitorService({
  store: monitorRepository,
  services: {
    getProjectIdOf: async (serviceId) =>
      (await codeReportService.getById(serviceId).catch(() => null))?.projectId ?? null,
  },
  encrypt: encryptMonitorSecrets,
  decrypt: decryptMonitorSecrets,
  runCheck,
  allowPrivateTargets: () => config.allowPrivateTargets,
  onChanged: (record) => slot.runtime.monitorChanged(record),
  onDeleted: (monitorId) => slot.runtime.monitorDeleted(monitorId),
});

export function getMonitoringConfig() {
  return config;
}

export function monitoringInfo() {
  return {
    dedicatedRepository: slot.usesDedicatedRepository,
    embeddedWorker: slot.worker !== null,
    internalApi: config.workerToken !== null,
    allowPrivateTargets: config.allowPrivateTargets,
    workers: slot.runtime.activeWorkers(),
    scheduler: slot.runtime.schedulerStats(),
  };
}

/**
 * Starts the metrics repository, the runtime and the embedded worker, once per process. Called
 * after GitDB is ready (`hooks.server.ts`); a failure here only disables monitoring.
 */
export function startMonitoring(): Promise<void> {
  slot.startup ??= (async () => {
    const repository = readMonitoringRepositoryConfig();
    if (repository) {
      slot.metricsDb = await startSecondaryGitDb({ name: 'monitoring', ...repository });
      slot.usesDedicatedRepository = true;
    }
    await slot.runtime.start();

    if (!slot.subscribed) {
      slot.subscribed = true;
      // a deleted Code Report service leaves its monitors without a service, not broken
      eventBus.subscribe('code_report.service.deleted', async (event) => {
        const projectId = event.scope.projectId;
        if (!projectId) return;
        for (const record of await monitorService.listRecordsByProject(projectId)) {
          if (record.serviceId === event.payload.serviceId) {
            await monitorRepository.update(record.id, { serviceId: null });
          }
        }
      });
      process.once('sveltekit:shutdown' as never, () => void stopMonitoring());
    }

    if (config.embeddedWorker && !slot.worker) {
      slot.worker = new MonitoringWorker({
        workerId: `embedded-${os.hostname()}`,
        region: null,
        transport: slot.runtime,
        concurrency: config.embeddedWorkerConcurrency,
        allowPrivateTargets: config.allowPrivateTargets,
        logChecks: config.checkLogs,
        logger: log,
      });
      slot.worker.start();
    }
    log.info(
      {
        dedicatedRepository: slot.usesDedicatedRepository,
        embeddedWorker: config.embeddedWorker,
        internalApi: config.workerToken !== null,
      },
      '[monitoring] started',
    );
  })().catch((error) => {
    slot.startup = null;
    throw error;
  });
  return slot.startup;
}

export async function stopMonitoring(): Promise<void> {
  await slot.worker?.stop(5_000);
  slot.worker = null;
  await slot.runtime.stop();
}

export { MonitorNotFoundError, MonitorValidationError } from './application/monitor.service';
export type { MonitorHeaderInput, MonitorInput } from './application/monitor.service';
export type { MonitorStats, MonitorLiveStatus, WorkerInfo } from './application/monitoring-runtime';
export type { MonitorView } from './domain/monitor.domain';
export type { Bar, IncidentRow } from './domain/aggregates';
export {
  MONITOR_DEFAULTS,
  MONITOR_LIMITS,
  MONITOR_INTERVAL_OPTIONS,
} from './domain/monitor-limits.data';
