import pino, { type Logger } from 'pino';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Structured logger that writes JSON to stdout so Google Cloud Logging parses it natively.
 *
 * What Cloud Logging picks up from each line (https://cloud.google.com/logging/docs/structured-logging):
 * - `severity`                        → entry severity (DEBUG/INFO/WARNING/ERROR/CRITICAL)
 * - `message`                         → entry summary (an error stack here feeds Error Reporting)
 * - `timestamp`                       → entry timestamp (RFC3339)
 * - `httpRequest`                     → request log entry, grouped in the Logs Explorer
 * - `logging.googleapis.com/trace`    → correlated with Cloud Trace (needs the full resource name)
 *
 * Config via env vars:
 * - LOG_MODE    → 'gcp' | 'standard' (default: 'gcp' in production, 'standard' in dev)
 *                 gcp      → structured JSON that Cloud Logging parses natively
 *                 standard → plain one-line output for local development
 * - LOG_FORMAT  → 'json' | 'pretty' (lower-level override; derived from LOG_MODE if unset)
 * - LOG_LEVEL   → pino level (default: 'debug' in dev, 'info' in production)
 * - GOOGLE_CLOUD_PROJECT → enables trace correlation in 'gcp' mode
 */

const PINO_LEVEL_TO_GCP_SEVERITY: Record<number, string> = {
  10: 'DEBUG', // trace
  20: 'DEBUG', // debug
  30: 'INFO', // info
  40: 'WARNING', // warn
  50: 'ERROR', // error
  60: 'CRITICAL', // fatal
};

const PINO_LEVEL_TO_TAG: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const isProduction = process.env.NODE_ENV === 'production';
const logMode = process.env.LOG_MODE ?? (isProduction ? 'gcp' : 'standard');
const gcpMode = logMode === 'gcp';

const useJson =
  process.env.LOG_FORMAT === 'json' || (!process.env.LOG_FORMAT && gcpMode);

const redact = {
  paths: [
    'password',
    'passwordConfirmation',
    'token',
    'apiKey',
    'authorization',
    'cookie',
    'req.headers.authorization',
    'req.headers.cookie',
    'httpRequest.headers.authorization',
    'httpRequest.headers.cookie',
    '*.password',
    '*.token',
    '*.secret',
  ],
  censor: '[redacted]',
};

export const logger = gcpMode
  ? pino({
      level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      messageKey: 'message',
      base: { service: 'gitops-platform' },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        // replaces pino's numeric `level` with the severity name Cloud Logging understands
        level(_label, number) {
          return { severity: PINO_LEVEL_TO_GCP_SEVERITY[number] ?? 'DEFAULT' };
        },
      },
      redact,
      hooks: {
        // `log.error(err, ...)` becomes `{ err } + stack as message`, which Cloud Error Reporting
        // requires to group and display the exception (the stack must live in `message`).
        logMethod(args, method) {
          const [first, ...rest] = args as unknown[];
          if (first instanceof Error) {
            const extra = rest.filter((a): a is string => typeof a === 'string').join(' ');
            return method.apply(this, [
              { err: first },
              [extra, first.stack ?? first.message].filter(Boolean).join(' '),
            ]);
          }
          return method.apply(this, args);
        },
      },
      transport: useJson
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
          },
    })
  : pino({
      // standard mode: plain line, safe outside GCP (no special JSON keys needed)
      level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(_label, number) {
          return { level: PINO_LEVEL_TO_TAG[number] ?? 'INFO' };
        },
      },
      redact,
      transport: useJson
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
              messageFormat: '[{module}] {msg}',
            },
          },
    });

/** Child logger tagged with the module it belongs to. Use one per file/service. */
export function createLogger(module: string): Logger {
  return logger.child({ module });
}

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;

/** Logger bound to a request: requestId everywhere, Cloud Trace context only in 'gcp' mode. */
export function createRequestLogger(event: RequestEvent): Logger {
  const traceHeader = event.request.headers.get('x-cloud-trace-context');
  let trace: Record<string, unknown> = {};

  if (gcpMode && PROJECT_ID && traceHeader) {
    const [traceId, rest] = traceHeader.split('/');
    const [spanId, flags] = (rest ?? '').split(';');
    trace = {
      ...(traceId
        ? { 'logging.googleapis.com/trace': `projects/${PROJECT_ID}/traces/${traceId}` }
        : {}),
      ...(spanId ? { 'logging.googleapis.com/spanId': spanId } : {}),
      ...(flags ? { 'logging.googleapis.com/trace_sampled': flags.includes('o=1') } : {}),
    };
  }

  return logger.child({ requestId: crypto.randomUUID(), ...trace });
}

function clientAddress(event: RequestEvent): string | undefined {
  try {
    return event.getClientAddress();
  } catch {
    return undefined;
  }
}

/** Emits the per-request summary entry; in 'gcp' mode Cloud Logging turns it into a request log. */
export function logHttpRequest(
  log: Logger,
  event: RequestEvent,
  response: Response,
  startMs: number,
): void {
  const elapsedMs = performance.now() - startMs;
  const message = `${event.request.method} ${event.url.pathname} → ${response.status} (${elapsedMs.toFixed(0)}ms)`;
  const entry = gcpMode
    ? {
        httpRequest: {
          requestMethod: event.request.method,
          requestUrl: `${event.url.pathname}${event.url.search}`,
          status: response.status,
          userAgent: event.request.headers.get('user-agent') ?? undefined,
          remoteIp: clientAddress(event),
          referer: event.request.headers.get('referer') ?? undefined,
          latency: `${(elapsedMs / 1000).toFixed(3)}s`,
        },
      }
    : {
        // plain fields in standard mode, still one structured entry locally
        method: event.request.method,
        url: `${event.url.pathname}${event.url.search}`,
        status: response.status,
        durationMs: Math.round(elapsedMs),
      };

  if (response.status >= 500) log.error(entry, message);
  else if (response.status >= 400) log.warn(entry, message);
  else log.info(entry, message);
}
