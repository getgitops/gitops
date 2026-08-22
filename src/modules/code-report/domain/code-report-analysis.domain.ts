import { Domain } from '$lib/server/domain/domain';

export type CodeReportAnalysisStatus = 'in_progress' | 'completed' | 'failed';

export interface CodeReportGitInfo {
  repositoryUrl?: string | null;
  branch?: string | null;
  commit?: string | null;
  commitMessage?: string | null;
  author?: string | null;
}

export class CodeReportAnalysisDomain extends Domain {
  public serviceId: string = '';
  public tool: string = '';
  public status: CodeReportAnalysisStatus = 'in_progress';
  public result: unknown = null;
  public summary?: unknown = null;
  public error?: string | null = null;
  public gitInfo?: CodeReportGitInfo | null = null;

  constructor(data: any) {
    super(data);
    this.serviceId = data.serviceId;
    this.tool = data.tool;
    this.status = data.status;
    this.result = data.result ?? null;
    this.summary = data.summary ?? null;
    this.error = data.error ?? null;
    this.gitInfo = data.gitInfo ?? null;
  }

  toJson() {
    return {
      id: this.id,
      serviceId: this.serviceId,
      tool: this.tool,
      status: this.status,
      result: this.result,
      summary: this.summary,
      error: this.error,
      gitInfo: this.gitInfo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
