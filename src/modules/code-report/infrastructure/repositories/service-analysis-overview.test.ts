import type { EntityRow } from '@getgitops/gitdb';
import { describe, expect, it, vi } from 'vitest';
import { summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
import { ServiceAnalysisOverview } from './service-analysis-overview';

function row(id: string, tool: string, day: number, extra: EntityRow = {}): EntityRow {
  return {
    id,
    serviceId: 'service',
    tool,
    status: 'completed',
    createdAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
    result: {
      Results: [
        {
          Vulnerabilities: [{ Severity: 'HIGH', PkgName: 'package' }],
          Packages: [{ Name: 'package' }, { Name: 'other' }],
        },
      ],
    },
    ...extra,
  };
}

describe('compact service analysis overview', () => {
  it('keeps all historical points and only the newest complete payload per tool', () => {
    const rows = [
      row('old', 'trivy', 1),
      row('secret', 'gitleaks', 2),
      row('other-service', 'trivy', 5, { serviceId: 'another' }),
      row('failed', 'trivy', 4, { status: 'failed', result: null, error: 'scan failed' }),
      row('latest-completed', 'trivy', 3),
      row('running', 'syft', 6, { status: 'in_progress', result: null }),
      row('manual', 'manual', 2),
    ];
    const overview = structuredClone(new ServiceAnalysisOverview().project(rows, 'service'));
    expect(overview.latestAnalysis?.id).toBe('running');
    expect(overview.latestByTool.trivy).toMatchObject({ id: 'failed', error: 'scan failed' });
    expect(overview.latestByTool.gitleaks?.result).toEqual(rows[1].result);
    expect(overview.latestByTool.manual?.id).toBe('manual');
    expect(overview.analysisHistory.map((entry) => entry.id)).toEqual([
      'latest-completed',
      'secret',
      'manual',
      'old',
    ]);
    for (const entry of overview.analysisHistory) {
      expect(entry.result).toBeNull();
      expect(entry.visualizationSummary).toEqual(summarizeAnalysisResult(rows[0].result));
    }
    expect(rows[0].result).not.toBeNull();
  });

  it('reuses summaries for unchanged snapshots but refreshes them when cache snapshots change', () => {
    const result = {
      get Results() {
        reads();
        return [{ Vulnerabilities: [{ Severity: 'HIGH' }] }];
      },
    };
    const reads = vi.fn();
    const snapshot = row('one', 'trivy', 1, { result });
    const builder = new ServiceAnalysisOverview();
    builder.project([snapshot], 'service');
    builder.project([snapshot], 'service');
    expect(reads).toHaveBeenCalledOnce();
    const changed = { ...snapshot, result: { Results: [{ Vulnerabilities: [] }] } };
    expect(
      builder.project([changed], 'service').analysisHistory[0].visualizationSummary
        .totalVulnerabilities,
    ).toBe(0);
  });

  it('normalizes tool casing and handles empty services and tools with prototype names', () => {
    const builder = new ServiceAnalysisOverview();
    expect(builder.project([], 'service')).toEqual({
      latestAnalysis: null,
      latestByTool: {},
      analysisHistory: [],
    });
    const overview = builder.project(
      [row('old', 'Trivy', 1), row('new', 'trivy', 2), row('prototype', '__proto__', 3)],
      'service',
    );
    expect(overview.latestByTool.trivy?.id).toBe('new');
    expect(Object.hasOwn(overview.latestByTool, '__proto__')).toBe(true);
  });

  it('reduces an 80-report response by more than 95% without dropping historical points', () => {
    const rows = Array.from({ length: 80 }, (_, i) =>
      row(String(i), 'trivy', i + 1, {
        result: {
          Results: [
            {
              Vulnerabilities: [
                { Severity: 'HIGH', PkgName: 'package', Description: 'x'.repeat(1_000_000) },
              ],
            },
          ],
        },
      }),
    );
    const builder = new ServiceAnalysisOverview();
    const oldStarted = performance.now();
    const previous = structuredClone(rows);
    const oldBytes = Buffer.byteLength(JSON.stringify(previous));
    const oldMs = performance.now() - oldStarted;
    builder.project(rows, 'service');
    const newStarted = performance.now();
    const overview = structuredClone(builder.project(rows, 'service'));
    const newBytes = Buffer.byteLength(JSON.stringify(overview));
    const newMs = performance.now() - newStarted;
    expect(overview.analysisHistory).toHaveLength(80);
    expect(overview.latestAnalysis?.result).toEqual(rows[79].result);
    expect(newBytes).toBeLessThan(oldBytes * 0.05);
    console.info('service detail synthetic benchmark', { oldBytes, newBytes, oldMs, newMs });
  });
});
