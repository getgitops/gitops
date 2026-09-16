import { DomainEvent, type DomainEventMetadata } from '../domain-event';

export interface CodeReportVulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface CodeReportAnalysisCompletedPayload {
  analysisId: string;
  serviceId: string;
  tool: string;
  completedAt: string;
  summary: {
    vulnerabilities: CodeReportVulnerabilitySummary;
    totalVulnerabilities: number;
  };
  policyCompliant?: boolean | null;
}

export class CodeReportAnalysisCompletedEvent extends DomainEvent<CodeReportAnalysisCompletedPayload> {
  static readonly eventName = 'code-report.analysis.completed';

  constructor(payload: CodeReportAnalysisCompletedPayload, metadata: DomainEventMetadata = {}) {
    super(payload, metadata);
  }

  get name(): string {
    return CodeReportAnalysisCompletedEvent.eventName;
  }
}
