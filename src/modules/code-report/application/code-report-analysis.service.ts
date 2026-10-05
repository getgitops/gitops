import crypto from 'crypto';
import { CodeReportAnalysisRepository } from '../infrastructure/repositories/code-report-analysis.repository';
import type { CodeReportAnalysisDomain } from '../domain/code-report-analysis.domain';
import type { CodeReportGitInfo } from '../domain/code-report-analysis.domain';
import { extractSecrets, extractVulnerabilities } from '$lib/code-report/analysis-summary';
import { evaluatePolicies, type PolicyComplianceReport } from '$lib/code-report/policy-evaluation';
import type { SecurityPolicy } from '$lib/code-report/security-policy';
import { TOOL_POLICY_TYPES, DEFAULT_POLICY_TYPES } from '../domain/tool-policy-types.data';
import { createLogger } from '$lib/server/logger';

const log = createLogger('code-report-analysis');

type ServiceLookup = {
  findById(id: string): Promise<{ id: string; projectId?: string; tags?: string[] } | null>;
};

type PolicyLookup = {
  listByProject(projectId: string): Promise<SecurityPolicy[]>;
};

export class CodeReportAnalysisService {
  constructor(
    private readonly repository: CodeReportAnalysisRepository,
    private readonly serviceLookup: ServiceLookup,
    private readonly policyLookup?: PolicyLookup,
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
    log.debug({ analysisId: id }, 'fetching analysis by id');
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
      securityPolicies: await this.evaluateSecurityPolicies(analysis.serviceId, analysis.tool, input.result),
      gitInfo: this.resolveGitInfo(analysis.gitInfo, input.gitInfo, input.result),
      error: null,
    });

    return this.getById(id);
  }

  private resolveGitInfo(
    current: CodeReportGitInfo | null | undefined,
    incoming: CodeReportGitInfo | null | undefined,
    result: unknown,
  ): CodeReportGitInfo | undefined {
    const resolved: CodeReportGitInfo = { ...(current ?? {}), ...(incoming ?? {}) };

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const root = result as Record<string, unknown>;
      const metadata = root.Metadata;
      if (metadata && typeof metadata === 'object') {
        const row = metadata as Record<string, unknown>;
        resolved.repositoryUrl = resolved.repositoryUrl ?? (row.RepoURL ? String(row.RepoURL) : null);
        resolved.commit = resolved.commit ?? (row.Commit ? String(row.Commit) : null);
        resolved.commitMessage =
          resolved.commitMessage ?? (row.CommitMsg ? String(row.CommitMsg) : null);
        resolved.author = resolved.author ?? (row.Author ? String(row.Author) : null);
        resolved.committer = resolved.committer ?? (row.Committer ? String(row.Committer) : null);
      }
      resolved.scannedAt = resolved.scannedAt ?? (root.CreatedAt ? String(root.CreatedAt) : null);
      resolved.artifactName = resolved.artifactName ?? (root.ArtifactName ? String(root.ArtifactName) : null);
      resolved.artifactType = resolved.artifactType ?? (root.ArtifactType ? String(root.ArtifactType) : null);
    }

    return Object.values(resolved).some((value) => value !== undefined && value !== null && value !== '')
      ? resolved
      : undefined;
  }

  // compliance is frozen at completion time so the UI never re-evaluates on read
  private async evaluateSecurityPolicies(
    serviceId: string,
    tool: string,
    result: unknown,
  ): Promise<PolicyComplianceReport | null> {
    if (!this.policyLookup) return null;

    const service = await this.serviceLookup.findById(serviceId);
    if (!service?.projectId) return null;

    const policies = await this.policyLookup.listByProject(service.projectId);
    const types = TOOL_POLICY_TYPES[tool.toLowerCase()] ?? DEFAULT_POLICY_TYPES;
    const scopedPolicies = policies.filter((policy) => types.includes(policy.type));
    if (scopedPolicies.length === 0) return null;

    const checksVulnerabilities = types.includes('vulnerabilities');
    const checksSecrets = types.includes('secrets');

    return evaluatePolicies(scopedPolicies, {
      serviceId: service.id,
      serviceTags: service.tags ?? [],
      vulnerabilities: checksVulnerabilities ? extractVulnerabilities(result) : [],
      secrets: checksSecrets ? extractSecrets(result) : [],
      hasVulnerabilityScan: checksVulnerabilities,
      hasSecretScan: checksSecrets,
    });
  }

  // re-runs the policy evaluation over the latest stored analysis of each service
  async revalidateLatestByServices(services: { id: string; tools?: string[] }[]) {
    let analysesUpdated = 0;
    const reports: { serviceId: string; report: PolicyComplianceReport }[] = [];

    for (const service of services) {
      const tools = service.tools?.length ? service.tools : ['trivy'];
      const latest = await this.getLatestByTool(service.id, tools);

      for (const analysis of Object.values(latest)) {
        if (!analysis || analysis.status !== 'completed') continue;

        const report = await this.evaluateSecurityPolicies(
          analysis.serviceId,
          analysis.tool,
          analysis.result,
        );
        if (!report) continue;

        await this.repository.update(analysis.id, { securityPolicies: report });
        analysesUpdated += 1;
        reports.push({ serviceId: service.id, report });
      }
    }

    return {
      servicesEvaluated: new Set(reports.map((entry) => entry.serviceId)).size,
      analysesUpdated,
      reports,
    };
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
