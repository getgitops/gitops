import crypto from 'crypto';
import { CodeReportServiceRepository } from '../infrastructure/repositories/code-report-service.repository';

type AnalysisCleanup = {
  deleteAllByService(serviceId: string): Promise<void>;
};

export class CodeReportService {
  constructor(
    private readonly repository: CodeReportServiceRepository,
    private readonly analysisCleanup?: AnalysisCleanup,
  ) {}

  async listByProject(projectId: string) {
    const services = await this.repository.findByProjectId(projectId);
    return services.map((service) => service.toJson());
  }

  async getById(id: string) {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new Error('Service not found');
    }
    return service.toJson();
  }

  async getByProjectAndSlug(projectId: string, slug: string) {
    const service = await this.repository.findBySlug(projectId, slug);
    if (!service) {
      throw new Error('Service not found');
    }
    return service.toJson();
  }

  async createService(input: {
    projectId: string;
    name: string;
    slug?: string;
    description?: string;
    tags?: string[];
  }) {
    const projectId = input.projectId?.trim();
    if (!projectId) {
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
}
