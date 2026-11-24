import type { FieldReference } from '#lib/events/catalog';
import type {
  AlertDirectory,
  NameIds,
  ReferenceOption,
  ResolvedNames,
  ScopeMember,
  ScopeRole,
} from '../application/types';
import type { AlertLocation } from '../domain/alert.domain';

type Named = { id: string; name: string; slug?: string | null };

type AccessRow = {
  userId: string;
  username: string;
  email: string | null;
  disabled?: boolean;
  status: string;
  scope: string;
  organizationId: string | null;
  projectId: string | null;
  role: { id: string } | null;
};

/** The module services the directory reads from; wired in `index.ts`. */
export type PlatformDirectoryDeps = {
  projects: {
    getProject(id: string): Promise<(Named & { organization?: Named | null }) | null>;
    listProjectsByOrganization(organizationId: string): Promise<Named[]>;
  };
  organizations: { getOrganization(id: string): Promise<Named | null> };
  access: {
    listUsers(
      scope: 'cluster' | 'organization' | 'project',
      scopeId?: string,
    ): Promise<AccessRow[]>;
  };
  roles: {
    listRoles(scope: 'organization' | 'project', scopeId: string): Promise<Named[]>;
  };
  codeReportServices: { listByProject(projectId: string): Promise<Named[]> };
  codeReportPolicies: { listByProject(projectId: string): Promise<Named[]> };
  vaultEnvironments: { listEnvironments(projectId: string): Promise<Named[]> };
  apiKeys: { listActiveApiKeysByProject(projectId: string): Promise<Named[]> };
  monitors?: { listByProject(projectId: string): Promise<Named[]> };
};

/**
 * `AlertDirectory` on top of the other modules. A location covers an organization and all its
 * projects, or one project; a failed lookup of one project yields no entries rather than an error.
 */
export class PlatformDirectory implements AlertDirectory {
  constructor(private readonly deps: PlatformDirectoryDeps) {}

  private async projectsOf(location: AlertLocation): Promise<Named[]> {
    if (location.scope === 'project' && location.projectId) {
      const project = await this.deps.projects.getProject(location.projectId).catch(() => null);
      return project && project.organization?.id === location.organizationId ? [project] : [];
    }
    return this.deps.projects.listProjectsByOrganization(location.organizationId).catch(() => []);
  }

  private async perProject(
    location: AlertLocation,
    read: (projectId: string) => Promise<Named[]>,
  ): Promise<ReferenceOption[]> {
    const projects = await this.projectsOf(location);
    const rows = await Promise.all(
      projects.map((project) => read(project.id).catch(() => [] as Named[])),
    );
    return rows.flat().map((row) => ({ id: row.id, label: row.name }));
  }

  private async accessRows(location: AlertLocation): Promise<AccessRow[]> {
    const organizationRows = await this.deps.access
      .listUsers('organization', location.organizationId)
      .catch(() => [] as AccessRow[]);
    const projects = await this.projectsOf(location);
    const projectRows = await Promise.all(
      projects.map((project) =>
        this.deps.access.listUsers('project', project.id).catch(() => [] as AccessRow[]),
      ),
    );
    return [...organizationRows, ...projectRows.flat()].filter((row) => row.status === 'active');
  }

  async listMembers(location: AlertLocation): Promise<ScopeMember[]> {
    const members = new Map<string, ScopeMember>();
    for (const row of await this.accessRows(location)) {
      const member = members.get(row.userId) ?? {
        userId: row.userId,
        username: row.username,
        email: row.email,
        disabled: row.disabled ?? false,
        roleIds: [],
      };
      if (row.role?.id && !member.roleIds.includes(row.role.id)) member.roleIds.push(row.role.id);
      members.set(row.userId, member);
    }
    return [...members.values()];
  }

  async listRoles(location: AlertLocation): Promise<ScopeRole[]> {
    const organizationRoles = await this.deps.roles
      .listRoles('organization', location.organizationId)
      .catch(() => [] as Named[]);
    const projectRoles =
      location.scope === 'project' && location.projectId
        ? await this.deps.roles.listRoles('project', location.projectId).catch(() => [] as Named[])
        : [];
    return [...organizationRoles, ...projectRoles].map((role) => ({
      id: role.id,
      name: role.name,
    }));
  }

  async listReferences(
    reference: FieldReference,
    location: AlertLocation,
  ): Promise<ReferenceOption[]> {
    switch (reference) {
      case 'project':
        return (await this.projectsOf(location)).map((project) => ({
          id: project.id,
          label: project.name,
        }));
      case 'code_report_service':
        return this.perProject(location, (id) => this.deps.codeReportServices.listByProject(id));
      case 'code_report_policy':
        return this.perProject(location, (id) => this.deps.codeReportPolicies.listByProject(id));
      case 'vault_environment':
        return this.perProject(location, (id) => this.deps.vaultEnvironments.listEnvironments(id));
      case 'api_key':
        return this.perProject(location, (id) => this.deps.apiKeys.listActiveApiKeysByProject(id));
      case 'monitor':
        return this.perProject(location, (id) => this.deps.monitors?.listByProject(id) ?? Promise.resolve([]));
      case 'user':
        return (await this.listMembers(location)).map((member) => ({
          id: member.userId,
          label: member.username,
        }));
      case 'role': {
        const organizationRoles = await this.listRoles({
          ...location,
          scope: 'organization',
          projectId: null,
        });
        const projectRoles = await this.perProject(location, (id) =>
          this.deps.roles.listRoles('project', id),
        );
        return [
          ...organizationRoles.map((role) => ({ id: role.id, label: role.name })),
          ...projectRoles,
        ];
      }
      default:
        return [];
    }
  }

  async findUser(userId: string): Promise<Omit<ScopeMember, 'roleIds'> | null> {
    const users = await this.deps.access.listUsers('cluster').catch(() => [] as AccessRow[]);
    const user = users.find((row) => row.userId === userId);
    return user
      ? {
          userId: user.userId,
          username: user.username,
          email: user.email,
          disabled: user.disabled ?? false,
        }
      : null;
  }

  async resolveNames(ids: NameIds): Promise<ResolvedNames> {
    const names: ResolvedNames = {};
    if (ids.organizationId) {
      const organization = await this.deps.organizations
        .getOrganization(ids.organizationId)
        .catch(() => null);
      if (organization) {
        names.organization = organization.name;
        if (organization.slug) names.organizationSlug = organization.slug;
      }
    }
    if (ids.projectId) {
      const project = await this.deps.projects.getProject(ids.projectId).catch(() => null);
      if (project) {
        names.project = project.name;
        if (project.slug) names.projectSlug = project.slug;
      }
    }
    if (ids.roleId && (ids.projectId || ids.organizationId)) {
      const roles = await this.deps.roles
        .listRoles(
          ids.projectId ? 'project' : 'organization',
          (ids.projectId ?? ids.organizationId) as string,
        )
        .catch(() => [] as Named[]);
      const role = roles.find((candidate) => candidate.id === ids.roleId);
      if (role) names.role = role.name;
    }
    return names;
  }
}
