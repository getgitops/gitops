import { DomainEvent } from '../domain-event';

export interface CodeReportAnalysisFailedPayload {
  analysisId: string;
  serviceId: string;
  tool: string;
  error: string;
  failedAt: string;
}

export class CodeReportAnalysisFailedEvent extends DomainEvent<CodeReportAnalysisFailedPayload> {
  static readonly eventName = 'code-report.analysis.failed';

  get name(): string {
    return CodeReportAnalysisFailedEvent.eventName;
  }
}
