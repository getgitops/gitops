import { CodeReportService } from './application/code-report.service';
import { CodeReportAnalysisService } from './application/code-report-analysis.service';
import { CodeReportServiceRepository } from './infrastructure/repositories/code-report-service.repository';
import { CodeReportAnalysisRepository } from './infrastructure/repositories/code-report-analysis.repository';

const codeReportServiceRepository = new CodeReportServiceRepository();
const codeReportAnalysisRepository = new CodeReportAnalysisRepository();

export const codeReportAnalysisService = new CodeReportAnalysisService(
  codeReportAnalysisRepository,
  codeReportServiceRepository,
);
export const codeReportService = new CodeReportService(
  codeReportServiceRepository,
  codeReportAnalysisService,
);
