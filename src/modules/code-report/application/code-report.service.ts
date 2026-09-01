import crypto from 'crypto';
import { CodeReportServiceRepository } from '../infrastructure/repositories/code-report-service.repository';
import { ProjectService } from '../../projects/application/project.service';
import { DEFAULT_RISK_WEIGHTS, type RiskWeights } from '../domain/risk-weights.data';

export type VulnerabilityTotals = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

type AnalysisCleanup = {
  deleteAllByService(serviceId: string): Promise<void>;
};

export class CodeReportService {
  constructor(
    private readonly repository: CodeReportServiceRepository,
    private readonly projectService: ProjectService,
    private readonly analysisCleanup?: AnalysisCleanup,
  ) {}

  async listByProject(projectId: string) {
    const services = await this.repository.findByProjectId(projectId);
    return services.map((service) => service.toJson());
  }

  async getRiskWeightsByProjectId(projectId: string): Promise<RiskWeights> {
    const project = await this.projectService.getProject(projectId);
    return this.resolveRiskWeights(project.settings);
  }

  calculateRiskScore(
    vulnerabilities: VulnerabilityTotals,
    riskWeights: RiskWeights = DEFAULT_RISK_WEIGHTS,
  ): number {
    return (
      vulnerabilities.critical * riskWeights.critical +
      vulnerabilities.high * riskWeights.high +
      vulnerabilities.medium * riskWeights.medium +
      vulnerabilities.low * riskWeights.low
    );
  }

  async getById(id: string) {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new Error('Service not found');
    }
    return service.toJson();
  }
  async getByProjectIdAndSlug(projectId: string, serviceSlug: string) {
    const service = await this.repository.findBySlug(projectId, serviceSlug);
    if (!service) {
      throw new Error('Service not found');
    }
    return service.toJson();
  }
  async getByProjectAndSlug(projectSlug: string, serviceSlug: string) {
    const project = await this.projectService.getProjectBySlug(projectSlug);
    if (!project) {
      throw new Error('Project not found');
    }
    const service = await this.repository.findBySlug(project.id, serviceSlug);
    if (!service) {
      throw new Error('Service not found');
    }
    return service.toJson();
  }

  // slug is globally unique, used by machine-to-machine endpoints that only know the project
  // via the API key (not passed explicitly in the request body)
  async findBySlugGlobal(slug: string) {
    const service = await this.repository.findBySlugGlobal(slug);
    return service ? service.toJson() : null;
  }

  async createService(input: {
    project: string;
    name: string;
    slug?: string;
    description?: string;
    tags?: string[];
  }) {
    const projectSlug = input.project?.trim();
    if (!projectSlug) {
      throw new Error('Project is required');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Service name is required');
    }

    const slug = this.normalizeSlug(input.slug || name);
    if (!slug) {
      throw new Error('Service slug is required');
    }
    const project = await this.projectService.getProjectBySlug(projectSlug);
    if (!project) {
      throw new Error('Project not found');
    }
    const projectId = project.id;
    const existing = await this.repository.findBySlug(projectId, slug);
    if (existing) {
      throw new Error('A service with this slug already exists in this project');
    }

    await this.repository.create({
      id: crypto.randomUUID(),
      projectId,
      slug,
      name,
      description: input.description?.trim() || undefined,
      tags: this.normalizeTags(input.tags),
      tools: ['trivy', 'gitleaks', 'sbom']
    });

    const created = await this.repository.findBySlug(projectId, slug);
    if (!created) {
      throw new Error('Failed to create service');
    }

    return created.toJson();
  }

  async updateService(
    id: string,
    changes: { name?: string; slug?: string; description?: string; tags?: string[] },
  ) {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new Error('Service not found');
    }

    const patch: { name?: string; slug?: string; description?: string; tags?: string[] } = {};

    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) {
        throw new Error('Service name is required');
      }
      patch.name = name;
    }

    if (changes.slug !== undefined) {
      const slug = this.normalizeSlug(changes.slug);
      if (!slug) {
        throw new Error('Service slug is required');
      }

      const existing = await this.repository.findBySlug(service.projectId, slug);
      if (existing && existing.id !== id) {
        throw new Error('A service with this slug already exists in this project');
      }
      patch.slug = slug;
    }

    if (changes.description !== undefined) {
      patch.description = changes.description.trim();
    }

    if (changes.tags !== undefined) {
      patch.tags = this.normalizeTags(changes.tags);
    }

    await this.repository.update(id, patch);
    return this.getById(id);
  }

  async deleteService(id: string) {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new Error('Service not found');
    }
    await this.analysisCleanup?.deleteAllByService(id);
    await this.repository.deleteById(id);
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private resolveRiskWeights(settings: any): RiskWeights {
    const multipliers = settings?.['code-report']?.securityRiskMultipliers;

    return {
      critical: this.toPositiveNumberOrDefault(multipliers?.critical, DEFAULT_RISK_WEIGHTS.critical),
      high: this.toPositiveNumberOrDefault(multipliers?.high, DEFAULT_RISK_WEIGHTS.high),
      medium: this.toPositiveNumberOrDefault(multipliers?.medium, DEFAULT_RISK_WEIGHTS.medium),
      low: this.toPositiveNumberOrDefault(multipliers?.low, DEFAULT_RISK_WEIGHTS.low),
    };
  }

  private toPositiveNumberOrDefault(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
