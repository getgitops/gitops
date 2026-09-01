import { apiKeysService, roleService, userAccessService } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { projectService } from '$modules/projects';
import { codeReportService } from '$modules/code-report';

export const E2E_PASSWORD = 'E2ePassword!123';

export type PersonaKey =
  | 'clusterAdmin'
  | 'clusterUserNoAccess'
  | 'orgAdmin'
  | 'orgDeveloper'
  | 'orgOutsider'
  | 'orgNone'
  | 'orgProjectsReadOnly'
  | 'projectAdmin'
  | 'projectDeveloper'
  | 'projectViewer'
  | 'projectReadOnly'
  | 'projectServerKeysNoDelete'
  | 'projectServerKeysNoUpdate'
  | 'projectUsersNoUpdate'
  | 'vaultSecretsOnly'
  | 'vaultEnvironmentsOnly'
  | 'stateiacStacksOnly'
  | 'projectOutsider';

export type PersonaSeed = {
  userId: string;
  username: string;
};

export type SeedOutput = {
  personas: Record<PersonaKey, PersonaSeed>;
  primaryOrgSlug: string;
  primaryOrgId: string;
  primaryProjectSlug: string;
  outsiderOrgSlug: string;
  outsiderProjectSlug: string;
  seededServiceSlug: string;
  apiKeys: {
    readOnly: string;
    write: string;
    outsiderProject: string;
  };
};

const CLUSTER_ADMIN_PERMISSIONS = [
  'cluster:organization:all',
  'cluster:projects:all',
  'cluster:users:all',
  'cluster:settings:all',
];

function roleIdBySlug(roles: { id: string; slug: string }[], slug: string): string {
  const role = roles.find((r) => r.slug === slug);
  if (!role) throw new Error(`Seed role not found: ${slug}`);
  return role.id;
}

export async function seedAll(): Promise<SeedOutput> {
  const clusterAdminRole = await roleService.createRole({
    name: 'Cluster Admin',
    slug: 'cluster-admin',
    scope: 'cluster',
    permissions: CLUSTER_ADMIN_PERMISSIONS,
  });
  const clusterUserRole = await roleService.createRole({
    name: 'Cluster User',
    slug: 'cluster-user',
    scope: 'cluster',
    permissions: [],
  });

  const clusterAdmin = await userAccessService.createClusterUser({
    username: 'e2e-cluster-admin',
    password: E2E_PASSWORD,
    roleId: clusterAdminRole.id,
    email: 'cluster-admin@e2e.test',
  });

  const clusterUserNoAccess = await userAccessService.createClusterUser({
    username: 'e2e-cluster-user-none',
    password: E2E_PASSWORD,
    roleId: clusterUserRole.id,
    email: 'cluster-user-none@e2e.test',
  });

  async function bareUser(username: string) {
    return userAccessService.createClusterUser({
      username,
      password: E2E_PASSWORD,
      roleId: clusterUserRole.id,
      email: `${username}@e2e.test`,
    });
  }

  async function assignProjectRole(projectId: string, userId: string, roleId: string) {
    await userAccessService.assignProjectUser({ projectId, userId, roleId });
  }

  // --- primary organization -------------------------------------------------------------
  const primaryOrg = await organizationService.createOrganization({
    name: 'E2E Primary Org',
    slug: 'e2e-primary',
  });
  await roleService.createDefaultOrganizationRoles(primaryOrg.id);
  const primaryOrgRoles = await roleService.listRoles('organization', primaryOrg.id);
  const orgAdminRoleId = roleIdBySlug(primaryOrgRoles, 'org-admin');
  const orgDeveloperRoleId = roleIdBySlug(primaryOrgRoles, 'org-developer');

  const orgAdmin = await userAccessService.createOrganizationUser({
    organizationId: primaryOrg.id,
    username: 'e2e-org-admin',
    password: E2E_PASSWORD,
    roleId: orgAdminRoleId,
    email: 'org-admin@e2e.test',
  });
  const orgDeveloper = await userAccessService.createOrganizationUser({
    organizationId: primaryOrg.id,
    username: 'e2e-org-developer',
    password: E2E_PASSWORD,
    roleId: orgDeveloperRoleId,
    email: 'org-developer@e2e.test',
  });

  const orgProjectsReadOnlyRole = await roleService.createRole({
    name: 'E2E Org Projects Read Only',
    slug: 'e2e-org-projects-read-only',
    scope: 'organization',
    organizationId: primaryOrg.id,
    permissions: ['organization:projects:read'],
  });
  const orgProjectsReadOnly = await userAccessService.createOrganizationUser({
    organizationId: primaryOrg.id,
    username: 'e2e-org-projects-read-only',
    password: E2E_PASSWORD,
    roleId: orgProjectsReadOnlyRole.id,
    email: 'org-projects-read-only@e2e.test',
  });

  // --- primary project under the primary org ----------------------------------------------
  const primaryProject = await projectService.createProject({
    organizationId: primaryOrg.id,
    name: 'E2E Primary Project',
    slug: 'e2e-project',
    modules: { vault: true, codereport: true, stateiac: true },
  });
  await roleService.createDefaultProjectRoles(primaryProject.id);
  const primaryProjectRoles = await roleService.listRoles('project', primaryProject.id);
  const projectAdminRoleId = roleIdBySlug(primaryProjectRoles, 'project-admin');
  const projectDeveloperRoleId = roleIdBySlug(primaryProjectRoles, 'project-developer');
  const projectViewerRoleId = roleIdBySlug(primaryProjectRoles, 'project-viewer');

  const projectAdminUser = await bareUser('e2e-project-admin');
  await assignProjectRole(primaryProject.id, projectAdminUser.userId, projectAdminRoleId);

  const projectDeveloperUser = await bareUser('e2e-project-developer');
  await assignProjectRole(primaryProject.id, projectDeveloperUser.userId, projectDeveloperRoleId);

  const projectViewerUser = await bareUser('e2e-project-viewer');
  await assignProjectRole(primaryProject.id, projectViewerUser.userId, projectViewerRoleId);

  const orgNoneUser = await bareUser('e2e-org-none');
  await assignProjectRole(primaryProject.id, orgNoneUser.userId, projectViewerRoleId);

  const readOnlyRole = await roleService.createRole({
    name: 'E2E Project Read Only',
    slug: 'e2e-project-read-only',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read'],
  });
  const projectReadOnlyUser = await bareUser('e2e-project-read-only');
  await assignProjectRole(primaryProject.id, projectReadOnlyUser.userId, readOnlyRole.id);

  const serverKeysNoDeleteRole = await roleService.createRole({
    name: 'E2E Server Keys No Delete',
    slug: 'e2e-server-keys-no-delete',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: [
      'project:project:read',
      'project:server-keys:read',
      'project:server-keys:create',
      'project:server-keys:update',
    ],
  });
  const serverKeysNoDeleteUser = await bareUser('e2e-server-keys-no-delete');
  await assignProjectRole(primaryProject.id, serverKeysNoDeleteUser.userId, serverKeysNoDeleteRole.id);

  const serverKeysNoUpdateRole = await roleService.createRole({
    name: 'E2E Server Keys No Update',
    slug: 'e2e-server-keys-no-update',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:server-keys:read', 'project:server-keys:create'],
  });
  const serverKeysNoUpdateUser = await bareUser('e2e-server-keys-no-update');
  await assignProjectRole(primaryProject.id, serverKeysNoUpdateUser.userId, serverKeysNoUpdateRole.id);

  await apiKeysService.createProjectApiKey({
    projectId: primaryProject.id,
    roleId: projectAdminRoleId,
    name: 'e2e-seeded-key-no-delete',
    expiresAt: null,
    createdByUserId: clusterAdmin.userId,
  });
  await apiKeysService.createProjectApiKey({
    projectId: primaryProject.id,
    roleId: projectAdminRoleId,
    name: 'e2e-seeded-key-no-update',
    expiresAt: null,
    createdByUserId: clusterAdmin.userId,
  });

  const usersNoUpdateRole = await roleService.createRole({
    name: 'E2E Users No Update',
    slug: 'e2e-users-no-update',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:users:read'],
  });
  const usersNoUpdateUser = await bareUser('e2e-users-no-update');
  await assignProjectRole(primaryProject.id, usersNoUpdateUser.userId, usersNoUpdateRole.id);

  const vaultSecretsOnlyRole = await roleService.createRole({
    name: 'E2E Vault Secrets Only',
    slug: 'e2e-vault-secrets-only',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:vault:secrets:read'],
  });
  const vaultSecretsOnlyUser = await bareUser('e2e-vault-secrets-only');
  await assignProjectRole(primaryProject.id, vaultSecretsOnlyUser.userId, vaultSecretsOnlyRole.id);

  const vaultEnvironmentsOnlyRole = await roleService.createRole({
    name: 'E2E Vault Environments Only',
    slug: 'e2e-vault-environments-only',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:vault:environments:read'],
  });
  const vaultEnvironmentsOnlyUser = await bareUser('e2e-vault-environments-only');
  await assignProjectRole(
    primaryProject.id,
    vaultEnvironmentsOnlyUser.userId,
    vaultEnvironmentsOnlyRole.id,
  );

  const stateiacStacksOnlyRole = await roleService.createRole({
    name: 'E2E StateIac Stacks Only',
    slug: 'e2e-stateiac-stacks-only',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:stateiac:stacks:read'],
  });
  const stateiacStacksOnlyUser = await bareUser('e2e-stateiac-stacks-only');
  await assignProjectRole(
    primaryProject.id,
    stateiacStacksOnlyUser.userId,
    stateiacStacksOnlyRole.id,
  );

  const seededService = await codeReportService.createService({
    project: primaryProject.slug,
    name: 'E2E Seeded Service',
  });

  const { token: readOnlyApiKeyToken } = await apiKeysService.createProjectApiKey({
    projectId: primaryProject.id,
    roleId: projectViewerRoleId,
    name: 'e2e-api-key-read-only',
    expiresAt: null,
    createdByUserId: clusterAdmin.userId,
  });
  const { token: writeApiKeyToken } = await apiKeysService.createProjectApiKey({
    projectId: primaryProject.id,
    roleId: projectDeveloperRoleId,
    name: 'e2e-api-key-write',
    expiresAt: null,
    createdByUserId: clusterAdmin.userId,
  });

  const outsiderOrg = await organizationService.createOrganization({
    name: 'E2E Outsider Org',
    slug: 'e2e-outsider',
  });
  await roleService.createDefaultOrganizationRoles(outsiderOrg.id);
  const outsiderOrgRoles = await roleService.listRoles('organization', outsiderOrg.id);
  const outsiderOrgAdminRoleId = roleIdBySlug(outsiderOrgRoles, 'org-admin');

  const orgOutsider = await userAccessService.createOrganizationUser({
    organizationId: outsiderOrg.id,
    username: 'e2e-org-outsider',
    password: E2E_PASSWORD,
    roleId: outsiderOrgAdminRoleId,
    email: 'org-outsider@e2e.test',
  });

  const outsiderProject = await projectService.createProject({
    organizationId: outsiderOrg.id,
    name: 'E2E Outsider Project',
    slug: 'e2e-outsider-project',
    modules: { vault: true, codereport: true, stateiac: true },
  });
  await roleService.createDefaultProjectRoles(outsiderProject.id);
  const outsiderProjectRoles = await roleService.listRoles('project', outsiderProject.id);
  const outsiderProjectAdminRoleId = roleIdBySlug(outsiderProjectRoles, 'project-admin');

  const projectOutsiderUser = await bareUser('e2e-project-outsider');
  await assignProjectRole(
    outsiderProject.id,
    projectOutsiderUser.userId,
    outsiderProjectAdminRoleId,
  );

  const { token: outsiderApiKeyToken } = await apiKeysService.createProjectApiKey({
    projectId: outsiderProject.id,
    roleId: outsiderProjectAdminRoleId,
    name: 'e2e-api-key-outsider',
    expiresAt: null,
    createdByUserId: clusterAdmin.userId,
  });

  return {
    personas: {
      clusterAdmin: { userId: clusterAdmin.userId, username: clusterAdmin.username },
      clusterUserNoAccess: {
        userId: clusterUserNoAccess.userId,
        username: clusterUserNoAccess.username,
      },
      orgAdmin: { userId: orgAdmin.userId, username: orgAdmin.username },
      orgDeveloper: { userId: orgDeveloper.userId, username: orgDeveloper.username },
      orgOutsider: { userId: orgOutsider.userId, username: orgOutsider.username },
      orgNone: { userId: orgNoneUser.userId, username: orgNoneUser.username },
      orgProjectsReadOnly: {
        userId: orgProjectsReadOnly.userId,
        username: orgProjectsReadOnly.username,
      },
      projectAdmin: { userId: projectAdminUser.userId, username: projectAdminUser.username },
      projectDeveloper: {
        userId: projectDeveloperUser.userId,
        username: projectDeveloperUser.username,
      },
      projectViewer: { userId: projectViewerUser.userId, username: projectViewerUser.username },
      projectReadOnly: {
        userId: projectReadOnlyUser.userId,
        username: projectReadOnlyUser.username,
      },
      projectServerKeysNoDelete: {
        userId: serverKeysNoDeleteUser.userId,
        username: serverKeysNoDeleteUser.username,
      },
      projectServerKeysNoUpdate: {
        userId: serverKeysNoUpdateUser.userId,
        username: serverKeysNoUpdateUser.username,
      },
      projectUsersNoUpdate: {
        userId: usersNoUpdateUser.userId,
        username: usersNoUpdateUser.username,
      },
      vaultSecretsOnly: {
        userId: vaultSecretsOnlyUser.userId,
        username: vaultSecretsOnlyUser.username,
      },
      vaultEnvironmentsOnly: {
        userId: vaultEnvironmentsOnlyUser.userId,
        username: vaultEnvironmentsOnlyUser.username,
      },
      stateiacStacksOnly: {
        userId: stateiacStacksOnlyUser.userId,
        username: stateiacStacksOnlyUser.username,
      },
      projectOutsider: {
        userId: projectOutsiderUser.userId,
        username: projectOutsiderUser.username,
      },
    },
    primaryOrgSlug: primaryOrg.slug,
    primaryOrgId: primaryOrg.id,
    primaryProjectSlug: primaryProject.slug,
    outsiderOrgSlug: outsiderOrg.slug,
    outsiderProjectSlug: outsiderProject.slug,
    seededServiceSlug: seededService.slug,
    apiKeys: {
      readOnly: readOnlyApiKeyToken,
      write: writeApiKeyToken,
      outsiderProject: outsiderApiKeyToken,
    },
  };
}
