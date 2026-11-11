import type { EntityRow } from '@getgitops/gitdb';
import { summarizeAnalysisResult, type AnalysisSummary } from '#lib/code-report/analysis-summary';
import { CodeReportAnalysisDomain } from '../../domain/code-report-analysis.domain';

type Analysis = ReturnType<CodeReportAnalysisDomain['toJson']>;
export type AnalysisHistoryEntry = Pick<Analysis, 'id' | 'tool' | 'status' | 'createdAt'> & {
  result: null;
  visualizationSummary: AnalysisSummary;
};

export class ServiceAnalysisOverview {
  // Immutable RAM snapshots keep summaries reusable; replaced snapshots can be garbage-collected.
  private readonly summaries = new WeakMap<object, AnalysisSummary>();

  project(rows: readonly Readonly<EntityRow>[], serviceId: string) {
    const analyses = rows
      .filter((row) => row.serviceId === serviceId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    const latestByTool: Record<string, Analysis | null> = {};
    const history: AnalysisHistoryEntry[] = [];
    let latestAnalysis: Analysis | null = null;

    for (const row of analyses) {
      const tool = String(row.tool).toLowerCase();
      if (latestAnalysis === null || !Object.hasOwn(latestByTool, tool)) {
        const analysis = new CodeReportAnalysisDomain(row).toJson();
        latestAnalysis ??= analysis;
        if (!Object.hasOwn(latestByTool, tool)) {
          Object.defineProperty(latestByTool, tool, {
            value: analysis,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
      }
      if (row.status !== 'completed') continue;
      let summary = this.summaries.get(row);
      if (!summary) {
        summary = summarizeAnalysisResult(row.result);
        this.summaries.set(row, summary);
      }
      history.push({
        id: String(row.id),
        tool: String(row.tool),
        status: 'completed',
        createdAt: new Date(String(row.createdAt)),
        result: null,
        visualizationSummary: summary,
      });
    }

    return { latestAnalysis, latestByTool, analysisHistory: history };
  }
}
