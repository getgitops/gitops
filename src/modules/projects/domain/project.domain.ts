import { Domain } from '$lib/server/domain/domain';
import { OrganizationDomain } from '../../organization/domain/organization.domain';

export interface ProjectStatus {
  ACTIVE: 'active';
  INACTIVE: 'inactive';
}

export interface ProjectModules {
  vault: boolean;
  codereport: boolean;
  stateiac: boolean;
}

export const DEFAULT_PROJECT_MODULES: ProjectModules = {
  vault: true,
  codereport: true,
  stateiac: true,
};

export interface ProjectSettings {
  'code-report': {
    securityRiskMultipliers: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    tools: {
      id: string;
      name: string;
      description: string;
      enabled: boolean;
      scanner?: string;
      soon?: boolean;
    }[];
  };
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  'code-report': {
    securityRiskMultipliers: {
      critical: 10,
      high: 6,
      medium: 3,
      low: 1,
    },
    tools: [
      { id: 'trivy', name: 'Trivy', description: 'Comprehensive security scanner', enabled: true },
    ]
  }
};

export class ProjectDomain extends Domain {
  public name: string = '';
  public slug: string | null = null;
  public description?: string | null = null;
  public status: ProjectStatus[keyof ProjectStatus] = 'active';
  public modules: ProjectModules = { ...DEFAULT_PROJECT_MODULES };
  public settings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
  public organization: OrganizationDomain | null = null;
  constructor(data: any) {
    super(data);
    this.name = data.name;
    this.slug = data.slug;
    this.description = data.description;
    this.status = data.status;
    this.modules = { ...DEFAULT_PROJECT_MODULES, ...(data.modules ?? {}) };
    const codeReportSettings = data.settings?.['code-report'] ?? {};
    this.settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      ...(data.settings ?? {}),
      'code-report': {
        ...DEFAULT_PROJECT_SETTINGS['code-report'],
        ...codeReportSettings,
        securityRiskMultipliers: {
          ...DEFAULT_PROJECT_SETTINGS['code-report'].securityRiskMultipliers,
          ...(codeReportSettings.securityRiskMultipliers ?? {}),
        },
        tools: codeReportSettings.tools ?? DEFAULT_PROJECT_SETTINGS['code-report'].tools,
      },
    };
    this.organization = data.organization ? new OrganizationDomain(data.organization) : null;
  }

  toJson() {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt,
      status: this.status,
      modules: this.modules,
      settings: this.settings,
      updatedAt: this.updatedAt,
      organization: this.organization ? this.organization.toJson() : null,
    };
  }
}
