import { CodeReportService } from './application/code-report.service';
import { CodeReportAnalysisService } from './application/code-report-analysis.service';
import { CodeReportCveService } from './application/code-report-cve.service';
import { CodeReportSecurityPolicyService } from './application/code-report-security-policy.service';
import { CodeReportServiceRepository } from './infrastructure/repositories/code-report-service.repository';
import { CodeReportAnalysisRepository } from './infrastructure/repositories/code-report-analysis.repository';
import { CodeReportSecurityPolicyRepository } from './infrastructure/repositories/code-report-security-policy.repository';
import { projectService } from '../projects';

const codeReportServiceRepository = new CodeReportServiceRepository();
const codeReportAnalysisRepository = new CodeReportAnalysisRepository();
const codeReportSecurityPolicyRepository = new CodeReportSecurityPolicyRepository();

export const codeReportAnalysisService = new CodeReportAnalysisService(
  codeReportAnalysisRepository,
  codeReportServiceRepository,
);
export const codeReportService = new CodeReportService(
  codeReportServiceRepository,
  projectService,
  codeReportAnalysisService,
);
export const codeReportCveService = new CodeReportCveService(
  codeReportService,
  codeReportAnalysisService,
);
export const codeReportSecurityPolicyService = new CodeReportSecurityPolicyService(
  codeReportSecurityPolicyRepository,
);
