import { collectCveOccurrences, type CompletedAnalysis, type CveOccurrence } from '$lib/code-report/cve-aggregation';
import type { CodeReportService } from './code-report.service';
import type { CodeReportAnalysisService } from './code-report-analysis.service';

export class CodeReportCveService {
  constructor(
    private readonly codeReportService: CodeReportService,
    private readonly codeReportAnalysisService: CodeReportAnalysisService,
  ) {}

  // only trivy analyses carry CVE-style vulnerability findings today
  async getProjectCveOccurrences(projectId: string): Promise<Map<string, CveOccurrence[]>> {
    const services = await this.codeReportService.listByProject(projectId);

    const analysisEntries = await Promise.all(
      services.map(async (service) => {
        const latest = await this.codeReportAnalysisService.getLatestByTool(service.id, ['trivy']);
        const analysis = latest.trivy;
        const completed: CompletedAnalysis = analysis?.status === 'completed' ? analysis : null;
        return [service.id, completed] as const;
      }),
    );

    return collectCveOccurrences(services, new Map(analysisEntries));
  }
}
