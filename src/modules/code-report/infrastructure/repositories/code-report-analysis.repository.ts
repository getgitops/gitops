import { Repository } from '$lib/server/infra/repository';
import {
  CodeReportAnalysisDomain,
  type CodeReportAnalysisStatus,
  type CodeReportGitInfo,
} from '../../domain/code-report-analysis.domain';
import { CodeReportAnalysisEntity } from '$lib/database/schemas';

export class CodeReportAnalysisRepository extends Repository {
  async findByServiceId(serviceId: string): Promise<CodeReportAnalysisDomain[]> {
    const result = await this.db
      .select()
      .from(CodeReportAnalysisEntity)
      .where({ serviceId })
      .orderBy('createdAt', 'desc');
    return result.rows.map((row: any) => new CodeReportAnalysisDomain(row));
  }

  async findById(id: string): Promise<CodeReportAnalysisDomain | null> {
    const result = await this.db.select().from(CodeReportAnalysisEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new CodeReportAnalysisDomain(row) : null;
  }

  async create(input: {
    id: string;
    serviceId: string;
    tool: string;
    status: CodeReportAnalysisStatus;
    gitInfo?: CodeReportGitInfo;
  }): Promise<void> {
    await this.db.insert(CodeReportAnalysisEntity).values({
      id: input.id,
      serviceId: input.serviceId,
      tool: input.tool,
      status: input.status,
      gitInfo: input.gitInfo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(
    id: string,
    changes: {
      status?: CodeReportAnalysisStatus;
      result?: unknown;
      summary?: unknown;
      error?: string | null;
      gitInfo?: CodeReportGitInfo;
    },
  ): Promise<void> {
    await this.db
      .update(CodeReportAnalysisEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(CodeReportAnalysisEntity).where({ id });
  }
}
