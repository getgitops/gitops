import crypto from 'crypto';
import { OrganizationRepository } from '../infrastructure/repositories/organization.repository';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_ORGANIZATION = { name: 'GitOps', slug: 'gitops' };

export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  async listOrganizations() {
    const organizations = await this.repository.findAll();
    return organizations.map((organization) => organization.toJson());
  }

  async getOrganization(id: string) {
    const organization = await this.repository.findById(id);
    if (!organization) {
      throw new Error('Organization not found');
    }
    return organization.toJson();
  }

  async findBySlug(slug: string) {
    const organization = await this.repository.findBySlug(slug);
    if (!organization) {
      throw new Error('Organization not found');
    }
    return organization.toJson();
  }

  // non-throwing variant, for callers that should degrade gracefully (e.g. the root layout)
  async tryFindBySlug(slug: string) {
    const organization = await this.repository.findBySlug(slug);
    return organization ? organization.toJson() : null;
  }

  // resolves the org to use when no slug is present in the route (e.g. bare '/')
  // returns null when no organization exists yet, instead of throwing
  async getDefaultOrganization() {
    const organizations = await this.repository.findAll();
    return organizations.length > 0 ? organizations[0].toJson() : null;
  }

  async createOrganization(input: { name: string; slug?: string; description?: string }) {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Organization name is required');
    }

    const slug = this.normalizeSlug(input.slug || name);
    if (!slug) {
      throw new Error('Organization slug is required');
    }

    const existing = await this.repository.findBySlug(slug);
    if (existing) {
      throw new Error('An organization with this slug already exists');
    }

    await this.repository.create({
      id: crypto.randomUUID(),
      slug,
      name,
      description: input.description?.trim() || undefined,
    });

    const created = await this.repository.findBySlug(slug);
    if (!created) {
      throw new Error('Failed to create organization');
    }

    return created.toJson();
  }

  async updateOrganization(
    id: string,
    changes: { name?: string; slug?: string; description?: string },
  ) {
    const organization = await this.repository.findById(id);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const patch: { name?: string; slug?: string; description?: string } = {};

    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) {
        throw new Error('Organization name is required');
      }
      patch.name = name;
    }

    if (changes.slug !== undefined) {
      const slug = this.normalizeSlug(changes.slug);
      if (!slug) {
        throw new Error('Organization slug is required');
      }

      const existing = await this.repository.findBySlug(slug);
      if (existing && existing.id !== id) {
        throw new Error('An organization with this slug already exists');
      }
      patch.slug = slug;
    }

    if (changes.description !== undefined) {
      patch.description = changes.description.trim();
    }

    await this.repository.update(id, patch);

    const updated = await this.repository.findById(id);
    if (!updated) {
      throw new Error('Failed to update organization');
    }

    return updated.toJson();
  }

  async deleteOrganization(id: string) {
    const organization = await this.repository.findById(id);
    if (!organization) {
      throw new Error('Organization not found');
    }

    await this.repository.deleteById(id);
  }

  // seeds the single default org so existing routes keep resolving 'gitops' out of the box
  async bootstrapDefaults(): Promise<void> {
    const existing = await this.repository.findBySlug(DEFAULT_ORGANIZATION.slug);
    if (existing) {
      return;
    }

    await this.repository.create({
      id: crypto.randomUUID(),
      slug: DEFAULT_ORGANIZATION.slug,
      name: DEFAULT_ORGANIZATION.name,
    });
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
