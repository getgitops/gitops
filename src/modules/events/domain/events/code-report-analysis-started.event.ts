import { DomainEvent } from '../domain-event';

export interface CodeReportAnalysisStartedPayload {
  analysisId: string;
  serviceId: string;
  tool: string;
  startedAt: string;
}

export class CodeReportAnalysisStartedEvent extends DomainEvent<CodeReportAnalysisStartedPayload> {
  static readonly eventName = 'code-report.analysis.started';

  get name(): string {
    return CodeReportAnalysisStartedEvent.eventName;
  }
}
