import crypto from 'crypto';
import { CodeReportAnalysisRepository } from '../infrastructure/repositories/code-report-analysis.repository';
import type { CodeReportAnalysisDomain } from '../domain/code-report-analysis.domain';
import type { CodeReportGitInfo } from '../domain/code-report-analysis.domain';

type ServiceLookup = {
  findById(id: string): Promise<{ id: string } | null>;
};

export class CodeReportAnalysisService {
  constructor(
    private readonly repository: CodeReportAnalysisRepository,
    private readonly serviceLookup: ServiceLookup,
  ) {}

  async listByService(serviceId: string) {
    const analyses = await this.repository.findByServiceId(serviceId);
    return analyses.map((analysis) => analysis.toJson());
  }

  async getLatestByTool(serviceId: string, tools: string[]) {
    const analyses = await Promise.all(
      tools.map((tool) => this.repository.findLatestByServiceIdAndTool(serviceId, tool)),
    );

    return tools.reduce<Record<string, ReturnType<CodeReportAnalysisDomain['toJson']> | null>>(
      (accumulator, tool, index) => {
        const analysis = analyses[index];
        accumulator[tool] = analysis ? analysis.toJson() : null;
        return accumulator;
      },
      {},
    );
  }

  async listByProject(serviceIds: string[]) {
    const analyses = await Promise.all(
      serviceIds.map((serviceId) => this.listByService(serviceId)),
    );
    return analyses
      .flat()
      .sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
  }

  async getById(id: string) {
    console.log('🔍 Fetching analysis by ID:', id);
    const analysis = await this.repository.findById(id);
    if (!analysis) {
      throw new Error('Analysis not found');
    }
    return analysis.toJson();
  }

  // called when a scan tool starts running against a service, reports 'in_progress' with no result yet
  async startAnalysis(input: { serviceId: string; tool: string; gitInfo?: CodeReportGitInfo }) {
      // const serviceId = input.serviceId?.trim();
      // if (!serviceId) {
      //   throw new Error('Service is required');
      // }

      // const service = await this.serviceLookup.findById(serviceId);
      // if (!service) {
      //   throw new Error('Service not found');
      // }

    const tool = input.tool?.trim();
    if (!tool) {
      throw new Error('Tool is required');
    }

    const id = crypto.randomUUID();
    await this.repository.create({
      id,
      serviceId: input.serviceId,
      tool,
      status: 'in_progress',
      gitInfo: input.gitInfo,
    });
    return { id, serviceId: input.serviceId, tool, status: 'in_progress', gitInfo: input.gitInfo };
    // return this.getById(id);
  }

  // called when the tool finishes successfully with the raw JSON result
  async completeAnalysis(
    id: string,
    input: { result: unknown; summary?: unknown; gitInfo?: CodeReportGitInfo },
  ) {
    const analysis = await this.repository.findById(id);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    if (input.result === undefined || input.result === null) {
      throw new Error('Result is required to complete an analysis');
    }

    await this.repository.update(id, {
      status: 'completed',
      result: input.result,
      summary: input.summary,
      gitInfo: input.gitInfo,
      error: null,
    });

    return this.getById(id);
  }

  // called when the tool could not run/complete, records the reason instead of a result
  async failAnalysis(id: string, input: { error: string; gitInfo?: CodeReportGitInfo }) {
    const analysis = await this.repository.findById(id);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    const error = input.error?.trim();
    if (!error) {
      throw new Error('Error reason is required to fail an analysis');
    }

    await this.repository.update(id, {
      status: 'failed',
      error,
      gitInfo: input.gitInfo,
    });

    return this.getById(id);
  }

  async deleteAnalysis(id: string) {
    const analysis = await this.repository.findById(id);
    if (!analysis) {
      throw new Error('Analysis not found');
    }
    await this.repository.deleteById(id);
  }

  async deleteAllByService(serviceId: string) {
    const analyses = await this.repository.findByServiceId(serviceId);
    for (const analysis of analyses) {
      await this.repository.deleteById(analysis.id);
    }
  }

  // manual upload path: paste/drop an already-finished report, skips the in_progress step
  async uploadAnalysis(input: { serviceId: string; tool?: string; result: unknown }) {
    const created = await this.startAnalysis({
      serviceId: input.serviceId,
      tool: input.tool?.trim() || 'manual-upload',
    });
    return this.completeAnalysis(created.id, { result: input.result });
  }

  // single entry point for the CI/CD-facing API: always creates a new analysis event
  // (each call is one report, not a resumable transition of a previous one)
  async reportAnalysis(input: {
    serviceId: string;
    status: 'in_progress' | 'completed' | 'failed';
    tool?: string;
    gitInfo?: CodeReportGitInfo;
    result?: unknown;
    error?: string;
  }) {
    const created = await this.startAnalysis({
      serviceId: input.serviceId,
      tool: input.tool?.trim() || 'api',
      gitInfo: input.gitInfo,
    });

    if (input.status === 'completed') {
      return this.completeAnalysis(created.id, { result: input.result, gitInfo: input.gitInfo });
    }

    if (input.status === 'failed') {
      return this.failAnalysis(created.id, {
        error: input.error || 'Unknown error',
        gitInfo: input.gitInfo,
      });
    }

    return created;
  }
}
