import { beforeEach, describe, expect, it } from 'vitest';
import { runWithActor } from '#lib/server/request-context';
import { RecordingEventBus } from '#lib/server/events/testing';
import type { SecurityPolicy } from '#lib/code-report/security-policy';
import { CodeReportAnalysisDomain } from '../domain/code-report-analysis.domain';
import { CodeReportAnalysisService } from './code-report-analysis.service';

class FakeAnalysisRepository {
  rows = new Map<string, Record<string, unknown>>();
  failUpdates = false;

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? new CodeReportAnalysisDomain(row) : null;
  }

  async create(input: Record<string, unknown> & { id: string }) {
    this.rows.set(input.id, { ...input, createdAt: new Date(), updatedAt: new Date() });
  }

  async update(id: string, changes: Record<string, unknown>) {
    if (this.failUpdates) throw new Error('GitDB write failed');
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    this.rows.set(id, { ...this.rows.get(id), ...defined });
  }
}

const SERVICE = { id: 'service-1', projectId: 'project-1', tags: [] };

const trivyResult = {
  Results: [
    {
      Target: 'package-lock.json',
      Vulnerabilities: [
        { VulnerabilityID: 'CVE-1', PkgName: 'a', Severity: 'CRITICAL' },
        { VulnerabilityID: 'CVE-2', PkgName: 'b', Severity: 'HIGH' },
        { VulnerabilityID: 'CVE-3', PkgName: 'c', Severity: 'LOW' },
      ],
      Secrets: [{ RuleID: 'aws-key', Match: 'AKIAIOSFODNN7EXAMPLE' }],
    },
  ],
};

function policy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  return {
    id: 'policy-1',
    projectId: 'project-1',
    slug: 'no-critical',
    name: 'No critical',
    description: null,
    type: 'vulnerabilities',
    enabled: true,
    enforcement: 'block',
    scope: { mode: 'all', services: [], tags: [] },
    rules: {
      maxCritical: 0,
      maxHigh: null,
      maxMedium: null,
      maxLow: null,
      minCvssScore: null,
      ignoreUnfixed: false,
      maxAgeDays: null,
      ignoredCves: [],
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('CodeReportAnalysisService events', () => {
  let repository: FakeAnalysisRepository;
  let events: RecordingEventBus;
  let policies: SecurityPolicy[];
  let service: CodeReportAnalysisService;

  beforeEach(() => {
    repository = new FakeAnalysisRepository();
    events = new RecordingEventBus();
    policies = [];
    service = new CodeReportAnalysisService(
      repository as never,
      { findById: async (id) => (id === SERVICE.id ? SERVICE : null) },
      { listByProject: async () => policies },
      {
        events,
        projects: { getProject: async () => ({ organization: { id: 'org-1' } }) },
      },
    );
  });

  it('publishes analysis.completed with server-side counts and the project scope', async () => {
    const { id } = await service.startAnalysis({
      serviceId: SERVICE.id,
      tool: 'trivy',
      gitInfo: { branch: 'main', commit: 'abc123', commitMessage: 'fix', author: 'ana' },
    });

    await service.completeAnalysis(id, { result: trivyResult });

    expect(events.types()).toEqual(['code_report.analysis.completed']);
    const [event] = events.ofType('code_report.analysis.completed');
    expect(event.scope).toEqual({ organizationId: 'org-1', projectId: 'project-1' });
    expect(event.payload).toEqual({
      analysisId: id,
      serviceId: SERVICE.id,
      tool: 'trivy',
      gitInfo: { repositoryUrl: null, branch: 'main', commit: 'abc123', version: null },
      summary: { critical: 1, high: 1, medium: 0, low: 1, unknown: 0, total: 3, secrets: 1 },
      policies: {
        status: 'no_policies',
        totalViolations: 0,
        blockingFailures: 0,
        failedPolicyIds: [],
      },
    });
  });

  it('publishes one policy.violated per failed policy after analysis.completed', async () => {
    policies = [
      policy(),
      policy({
        id: 'policy-2',
        slug: 'warn-high',
        name: 'Warn high',
        enforcement: 'warn',
        rules: { ...policy().rules, maxCritical: null, maxHigh: 0 } as SecurityPolicy['rules'],
      }),
      policy({
        id: 'policy-3',
        slug: 'ok',
        name: 'Lenient',
        rules: { ...policy().rules, maxCritical: 10 } as SecurityPolicy['rules'],
      }),
    ];
    const { id } = await service.startAnalysis({ serviceId: SERVICE.id, tool: 'trivy' });

    await service.completeAnalysis(id, { result: trivyResult });

    expect(events.types()).toEqual([
      'code_report.analysis.completed',
      'code_report.policy.violated',
      'code_report.policy.violated',
    ]);
    expect(events.ofType('code_report.analysis.completed')[0].payload.policies).toEqual({
      status: 'violated',
      totalViolations: 2,
      blockingFailures: 1,
      failedPolicyIds: ['policy-1', 'policy-2'],
    });
    expect(events.ofType('code_report.policy.violated').map((event) => event.payload)).toEqual([
      {
        analysisId: id,
        serviceId: SERVICE.id,
        tool: 'trivy',
        policyId: 'policy-1',
        policyName: 'No critical',
        policyType: 'vulnerabilities',
        enforcement: 'block',
        violations: 1,
      },
      expect.objectContaining({ policyId: 'policy-2', enforcement: 'warn', violations: 1 }),
    ]);
  });

  it('publishes analysis.failed with the reason', async () => {
    const { id } = await service.startAnalysis({
      serviceId: SERVICE.id,
      tool: 'gitleaks',
      gitInfo: { branch: 'feature/x' },
    });

    await service.failAnalysis(id, { error: 'scanner crashed' });

    expect(events.types()).toEqual(['code_report.analysis.failed']);
    expect(events.ofType('code_report.analysis.failed')[0].payload).toEqual({
      analysisId: id,
      serviceId: SERVICE.id,
      tool: 'gitleaks',
      gitInfo: { repositoryUrl: null, branch: 'feature/x', commit: null, version: null },
      error: 'scanner crashed',
    });
  });

  it('attributes CI/CD reports to the API key', async () => {
    await runWithActor(
      {
        name: 'apikey:ci',
        email: 'apikey+key-1@gitops.local',
        apiKeyId: 'key-1',
        apiKeyProjectId: 'project-1',
      },
      () =>
        service.reportAnalysis({ serviceId: SERVICE.id, status: 'completed', result: trivyResult }),
    );

    expect(events.ofType('code_report.analysis.completed')[0].actor).toEqual({
      kind: 'api_key',
      apiKeyId: 'key-1',
      projectId: 'project-1',
    });
  });

  it('does not publish for in_progress reports', async () => {
    await service.reportAnalysis({ serviceId: SERVICE.id, status: 'in_progress' });

    expect(events.events).toEqual([]);
  });

  it('publishes nothing when the analysis does not exist or input is invalid', async () => {
    await expect(service.completeAnalysis('missing', { result: {} })).rejects.toThrow();
    const { id } = await service.startAnalysis({ serviceId: SERVICE.id, tool: 'trivy' });
    await expect(service.completeAnalysis(id, { result: null })).rejects.toThrow();
    await expect(service.failAnalysis(id, { error: '  ' })).rejects.toThrow();

    expect(events.events).toEqual([]);
  });

  it('publishes nothing when the GitDB write fails', async () => {
    const { id } = await service.startAnalysis({ serviceId: SERVICE.id, tool: 'trivy' });
    repository.failUpdates = true;

    await expect(service.completeAnalysis(id, { result: trivyResult })).rejects.toThrow();
    await expect(service.failAnalysis(id, { error: 'boom' })).rejects.toThrow();

    expect(events.events).toEqual([]);
  });

  it('never fails the request when publishing fails', async () => {
    const throwing = new CodeReportAnalysisService(
      repository as never,
      { findById: async () => SERVICE },
      undefined,
      {
        events: {
          publish: () => {
            throw new Error('bus down');
          },
        },
      },
    );
    const { id } = await throwing.startAnalysis({ serviceId: SERVICE.id, tool: 'trivy' });

    await expect(throwing.completeAnalysis(id, { result: trivyResult })).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('never includes the scan result or secret matches in the payload', async () => {
    const { id } = await service.startAnalysis({ serviceId: SERVICE.id, tool: 'trivy' });

    await service.completeAnalysis(id, { result: trivyResult });

    const serialized = JSON.stringify(events.events);
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(serialized).not.toContain('CVE-1');
  });
});
