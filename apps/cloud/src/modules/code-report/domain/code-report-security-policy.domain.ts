import { Domain } from '$lib/server/domain/domain';
import { ProjectDomain } from '../../projects/domain/project.domain';
import {
  defaultScope,
  type SecurityPolicyEnforcement,
  type SecurityPolicyRules,
  type SecurityPolicyScope,
  type SecurityPolicyType,
} from '$lib/code-report/security-policy';

export class CodeReportSecurityPolicyDomain extends Domain {
  public projectId: string = '';
  public slug: string = '';
  public name: string = '';
  public description?: string | null = null;
  public type: SecurityPolicyType = 'vulnerabilities';
  public enabled: boolean = true;
  public enforcement: SecurityPolicyEnforcement = 'warn';
  public scope: SecurityPolicyScope = defaultScope();
  public rules: SecurityPolicyRules = {};
  public project: ProjectDomain | null = null;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type ?? 'vulnerabilities';
    this.enabled = data.enabled ?? true;
    this.enforcement = data.enforcement ?? 'warn';
    this.scope = { ...defaultScope(), ...(data.scope ?? {}) };
    this.rules = data.rules ?? {};
    this.project = data.project ? new ProjectDomain(data.project) : null;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      slug: this.slug,
      name: this.name,
      description: this.description ?? null,
      type: this.type,
      enabled: this.enabled,
      enforcement: this.enforcement,
      scope: this.scope,
      rules: this.rules,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      project: this.project ? this.project.toJson() : null,
    };
  }
}
