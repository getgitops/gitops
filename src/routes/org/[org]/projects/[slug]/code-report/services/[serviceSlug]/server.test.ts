import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  service: vi.fn(),
  overview: vi.fn(),
  weights: vi.fn(),
}));
vi.mock('#modules/code-report', () => ({
  codeReportService: {
    getByProjectIdAndSlug: mocks.service,
    getRiskWeightsByProjectId: mocks.weights,
  },
  codeReportAnalysisService: { getServiceOverview: mocks.overview },
}));
vi.mock('#modules/projects', () => ({ projectService: {} }));
vi.mock('#modules/auth', () => ({ cancanService: { canSessionUser: mocks.permission } }));

const logger = { debug: vi.fn(), error: vi.fn() };
const event = () =>
  ({
    parent: async () => ({ project: { id: 'project', organization: { id: 'org' } } }),
    params: { serviceSlug: 'api' },
    locals: { user: { id: 'user' }, logger },
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.service.mockResolvedValue({ id: 'service', tools: ['custom'] });
  mocks.weights.mockResolvedValue({ critical: 10, high: 6, medium: 3, low: 1 });
  mocks.overview.mockResolvedValue({
    latestAnalysis: { id: 'current' },
    latestByTool: { trivy: { id: 'current' } },
    analysisHistory: [{ id: 'old', result: null, visualizationSummary: {} }],
  });
});

describe('service detail loader', () => {
  it('loads analyses once, preserves permissions and includes missing tools', async () => {
    const result = await load(event());
    expect(mocks.overview).toHaveBeenCalledExactlyOnceWith('service');
    expect(result.analysisHistory).toHaveLength(1);
    expect(result.latestByTool).toMatchObject({
      trivy: { id: 'current' },
      syft: null,
      sbom: null,
      gitleaks: null,
      custom: null,
    });
    expect(result).toMatchObject({ canCreate: true, canDelete: true });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        historyEntries: 1,
        durationMs: expect.any(Number),
      }),
      'code report service detail loaded',
    );
  });

  it('does not load report data when read permission is denied', async () => {
    mocks.permission.mockResolvedValueOnce(false);
    await expect(load(event())).rejects.toMatchObject({ status: 403 });
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it('returns 404 only for missing services and exposes infrastructure failures', async () => {
    mocks.service.mockRejectedValueOnce(new Error('Service not found'));
    await expect(load(event())).rejects.toMatchObject({ status: 404 });
    mocks.service.mockRejectedValueOnce(new Error('Disk failure'));
    await expect(load(event())).rejects.toThrow('Disk failure');
    mocks.overview.mockRejectedValueOnce(new Error('Cache failure'));
    await expect(load(event())).rejects.toThrow('Cache failure');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'service' }),
      'code report service detail failed',
    );
  });
});
