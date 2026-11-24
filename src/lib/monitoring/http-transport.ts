/**
 * Transport for standalone workers: the internal monitoring API of the GitOps server, reached over
 * the private network (`http://gitops.railway.internal:3000`) with `MONITORING_WORKER_TOKEN`.
 */
import type {
  LeaseRequest,
  LeaseResponse,
  MonitoringTransport,
  ReportRequest,
  ReportResponse,
} from './types.ts';

export type HttpTransportOptions = {
  baseUrl: string;
  token: string;
  requestTimeoutMs?: number;
};

export class HttpMonitoringTransport implements MonitoringTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  lease(request: LeaseRequest): Promise<LeaseResponse> {
    return this.post<LeaseResponse>('/api/internal/monitoring/lease', request);
  }

  report(request: ReportRequest): Promise<ReportResponse> {
    return this.post<ReportResponse>('/api/internal/monitoring/results', request);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      throw new Error(
        `${path} answered ${response.status}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
      );
    }
    return (await response.json()) as T;
  }
}
