import { extractInventoryPackages, type InventoryPackage } from '#lib/code-report/package-inventory';
import { collectCveOccurrences, type CompletedAnalysis, type CveOccurrence } from '#lib/code-report/cve-aggregation';
import type { CodeReportService } from './code-report.service';
import type { CodeReportAnalysisService } from './code-report-analysis.service';

export type OrganizationCveOccurrence = CveOccurrence & {
  projectId: string;
  projectSlug: string;
  projectName: string;
};

export type ServicePackageInventory = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  projectId: string;
  packages: InventoryPackage[];
};

// the tools whose latest completed analysis tells which packages a service uses
const INVENTORY_TOOLS = ['trivy', 'sbom', 'syft'];

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
        const completed: CompletedAnalysis =
          analysis?.status === 'completed'
            ? {
                result: analysis.result,
                createdAt:
                  analysis.createdAt instanceof Date
                    ? analysis.createdAt.toISOString()
                    : String(analysis.createdAt),
              }
            : null;
        return [service.id, completed] as const;
      }),
    );

    return collectCveOccurrences(services, new Map(analysisEntries));
  }

  async getOrganizationCveOccurrences(
    projects: { id: string; slug: string; name: string }[],
  ): Promise<Map<string, OrganizationCveOccurrence[]>> {
    const occurrencesByCve = new Map<string, OrganizationCveOccurrence[]>();

    for (const project of projects) {
      const projectOccurrences = await this.getProjectCveOccurrences(project.id);

      for (const [cveId, occurrences] of projectOccurrences.entries()) {
        const merged = occurrencesByCve.get(cveId) ?? [];
        merged.push(
          ...occurrences.map((occurrence) => ({
            ...occurrence,
            projectId: project.id,
            projectSlug: project.slug,
            projectName: project.name,
          })),
        );
        occurrencesByCve.set(cveId, merged);
      }
    }

    return occurrencesByCve;
  }

  /**
   * The distinct packages of each service of the projects, from the latest completed Trivy, SBOM
   * and syft analyses (their union).
   */
  async getOrganizationPackages(
    projects: { id: string }[],
  ): Promise<ServicePackageInventory[]> {
    const inventory: ServicePackageInventory[] = [];
    for (const project of projects) {
      const services = await this.codeReportService.listByProject(project.id);
      for (const service of services) {
        const latest = await this.codeReportAnalysisService.getLatestByTool(
          service.id,
          INVENTORY_TOOLS,
        );
        const packages = new Map<string, InventoryPackage>();
        for (const tool of INVENTORY_TOOLS) {
          const analysis = latest[tool];
          if (analysis?.status !== 'completed') continue;
          for (const pkg of extractInventoryPackages(analysis.result))
            packages.set(`${pkg.ecosystem}|${pkg.name}`, pkg);
        }
        inventory.push({
          serviceId: service.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          projectId: project.id,
          packages: [...packages.values()],
        });
      }
    }
    return inventory;
  }
}
