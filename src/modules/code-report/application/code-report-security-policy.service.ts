import crypto from 'crypto';
import { CodeReportSecurityPolicyRepository } from '../infrastructure/repositories/code-report-security-policy.repository';
import {
  defaultRulesFor,
  defaultScope,
  isSecurityPolicyType,
  SECURITY_POLICY_ENFORCEMENTS,
  SECURITY_POLICY_SCOPE_MODES,
  type SecurityPolicyEnforcement,
  type SecurityPolicyRules,
  type SecurityPolicyScope,
  type SecurityPolicyType,
} from '$lib/code-report/security-policy';

export type SecurityPolicyInput = {
  name: string;
  slug?: string;
  description?: string;
  type: string;
  enabled?: boolean;
  enforcement?: string;
  scope?: Partial<SecurityPolicyScope>;
  rules?: Record<string, unknown>;
};

export class CodeReportSecurityPolicyService {
  constructor(private readonly repository: CodeReportSecurityPolicyRepository) {}

  async listByProject(projectId: string) {
    const policies = await this.repository.findByProjectId(projectId);
    return policies.map((policy) => policy.toJson());
  }

  async getById(id: string) {
    const policy = await this.repository.findById(id);
    if (!policy) {
      throw new Error('Security policy not found');
    }
    return policy.toJson();
  }

  async create(projectId: string, input: SecurityPolicyInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new Error('El nombre de la política es obligatorio');
    }

    const type = this.normalizeType(input.type);
    const slug = this.normalizeSlug(input.slug || name);
    if (!slug) {
      throw new Error('El slug de la política es obligatorio');
    }

    const existing = await this.repository.findBySlug(projectId, slug);
    if (existing) {
      throw new Error('Ya existe una política con este slug en el proyecto');
    }

    const id = crypto.randomUUID();
    await this.repository.create({
      id,
      projectId,
      slug,
      name,
      description: input.description?.trim() || undefined,
      type,
      enabled: input.enabled ?? true,
      enforcement: this.normalizeEnforcement(input.enforcement),
      scope: this.normalizeScope(input.scope),
      rules: this.normalizeRules(type, input.rules),
    });

    return this.getById(id);
  }

  async update(id: string, changes: Partial<SecurityPolicyInput>) {
    const policy = await this.repository.findById(id);
    if (!policy) {
      throw new Error('Security policy not found');
    }

    const patch: Parameters<CodeReportSecurityPolicyRepository['update']>[1] = {};

    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) {
        throw new Error('El nombre de la política es obligatorio');
      }
      patch.name = name;
    }

    if (changes.slug !== undefined) {
      const slug = this.normalizeSlug(changes.slug);
      if (!slug) {
        throw new Error('El slug de la política es obligatorio');
      }
      const existing = await this.repository.findBySlug(policy.projectId, slug);
      if (existing && existing.id !== id) {
        throw new Error('Ya existe una política con este slug en el proyecto');
      }
      patch.slug = slug;
    }

    if (changes.description !== undefined) {
      patch.description = changes.description.trim();
    }

    const type = changes.type !== undefined ? this.normalizeType(changes.type) : policy.type;
    if (changes.type !== undefined) {
      patch.type = type;
    }

    if (changes.enabled !== undefined) {
      patch.enabled = Boolean(changes.enabled);
    }

    if (changes.enforcement !== undefined) {
      patch.enforcement = this.normalizeEnforcement(changes.enforcement);
    }

    if (changes.scope !== undefined) {
      patch.scope = this.normalizeScope(changes.scope);
    }

    if (changes.rules !== undefined || changes.type !== undefined) {
      patch.rules = this.normalizeRules(type, changes.rules ?? policy.rules);
    }

    await this.repository.update(id, patch);
    return this.getById(id);
  }

  async setEnabled(id: string, enabled: boolean) {
    return this.update(id, { enabled });
  }

  async delete(id: string) {
    const policy = await this.repository.findById(id);
    if (!policy) {
      throw new Error('Security policy not found');
    }
    await this.repository.deleteById(id);
  }

  private normalizeType(value: unknown): SecurityPolicyType {
    if (!isSecurityPolicyType(value)) {
      throw new Error('Tipo de política no soportado');
    }
    return value;
  }

  private normalizeEnforcement(value: unknown): SecurityPolicyEnforcement {
    return SECURITY_POLICY_ENFORCEMENTS.includes(value as SecurityPolicyEnforcement)
      ? (value as SecurityPolicyEnforcement)
      : 'warn';
  }

  private normalizeScope(value: Partial<SecurityPolicyScope> | undefined): SecurityPolicyScope {
    const scope = { ...defaultScope(), ...(value ?? {}) };
    const mode = SECURITY_POLICY_SCOPE_MODES.includes(scope.mode) ? scope.mode : 'all';
    return {
      mode,
      services: mode === 'services' ? this.normalizeStringList(scope.services) : [],
      tags: mode === 'tags' ? this.normalizeStringList(scope.tags) : [],
    };
  }

  private normalizeRules(
    type: SecurityPolicyType,
    rules: Record<string, unknown> | SecurityPolicyRules | undefined,
  ): SecurityPolicyRules {
    const input = (rules ?? {}) as Record<string, unknown>;

    if (type === 'vulnerabilities') {
      return {
        maxCritical: this.normalizeCount(input.maxCritical),
        maxHigh: this.normalizeCount(input.maxHigh),
        maxMedium: this.normalizeCount(input.maxMedium),
        maxLow: this.normalizeCount(input.maxLow),
        minCvssScore: this.normalizeRange(input.minCvssScore, 0, 10),
        ignoreUnfixed: Boolean(input.ignoreUnfixed),
        maxAgeDays: this.normalizeCount(input.maxAgeDays),
        ignoredCves: this.normalizeStringList(input.ignoredCves).map((cve) => cve.toUpperCase()),
      };
    }

    if (type === 'license') {
      return {
        mode: input.mode === 'allowlist' ? 'allowlist' : 'denylist',
        licenses: this.normalizeStringList(input.licenses),
        allowUnknown: Boolean(input.allowUnknown),
      };
    }

    if (type === 'code_coverage') {
      return {
        minTotalCoverage: this.normalizeRange(input.minTotalCoverage, 0, 100),
        minPatchCoverage: this.normalizeRange(input.minPatchCoverage, 0, 100),
        allowCoverageDrop: Boolean(input.allowCoverageDrop),
      };
    }

    if (type === 'secrets') {
      return {
        maxSecrets: this.normalizeCount(input.maxSecrets),
        blockVerifiedOnly: Boolean(input.blockVerifiedOnly),
        ignoredRules: this.normalizeStringList(input.ignoredRules),
      };
    }

    return defaultRulesFor(type);
  }

  private normalizeCount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
  }

  private normalizeRange(value: unknown, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(max, Math.max(min, parsed));
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0),
      ),
    ];
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
