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
    ],
  },
};
