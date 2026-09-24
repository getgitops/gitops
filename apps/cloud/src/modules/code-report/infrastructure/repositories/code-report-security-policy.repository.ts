import { Repository } from '$lib/server/infra/repository';
import { CodeReportSecurityPolicyDomain } from '../../domain/code-report-security-policy.domain';
import { CodeReportSecurityPolicyEntity } from '$lib/database/schemas';
import type {
  SecurityPolicyEnforcement,
  SecurityPolicyRules,
  SecurityPolicyScope,
  SecurityPolicyType,
} from '$lib/code-report/security-policy';

export class CodeReportSecurityPolicyRepository extends Repository {
  async findByProjectId(projectId: string): Promise<CodeReportSecurityPolicyDomain[]> {
    const result = await this.db
      .select()
      .from(CodeReportSecurityPolicyEntity)
      .where({ projectId })
      .orderBy('createdAt', 'desc');
    return result.rows.map((row: any) => new CodeReportSecurityPolicyDomain(row));
  }

  async findById(id: string): Promise<CodeReportSecurityPolicyDomain | null> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportSecurityPolicyEntity)
      .where({ id })
      .limit(1);
    const row = result.rows[0];
    return row ? new CodeReportSecurityPolicyDomain(row) : null;
  }

  async findBySlug(
    projectId: string,
    slug: string,
  ): Promise<CodeReportSecurityPolicyDomain | null> {
    const result = await this.db
      .select()
      .from(CodeReportSecurityPolicyEntity)
      .where({ projectId, slug })
      .limit(1);
    const row = result.rows[0];
    return row ? new CodeReportSecurityPolicyDomain(row) : null;
  }

  async create(input: {
    id: string;
    projectId: string;
    slug: string;
    name: string;
    description?: string;
    type: SecurityPolicyType;
    enabled: boolean;
    enforcement: SecurityPolicyEnforcement;
    scope: SecurityPolicyScope;
    rules: SecurityPolicyRules;
  }): Promise<void> {
    await this.db.insert(CodeReportSecurityPolicyEntity).values({
      ...input,
      description: input.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(
    id: string,
    changes: {
      name?: string;
      slug?: string;
      description?: string;
      type?: SecurityPolicyType;
      enabled?: boolean;
      enforcement?: SecurityPolicyEnforcement;
      scope?: SecurityPolicyScope;
      rules?: SecurityPolicyRules;
    },
  ): Promise<void> {
    await this.db
      .update(CodeReportSecurityPolicyEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(CodeReportSecurityPolicyEntity).where({ id });
  }
}
