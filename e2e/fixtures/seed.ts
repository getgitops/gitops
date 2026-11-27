import { apiKeysService, roleService, userAccessService } from '#modules/auth';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import { codeReportAnalysisService, codeReportService } from '#modules/code-report';
import { CveFeedStoreRepository } from '#modules/cve-feed/infrastructure/repositories/cve-feed-store.repository';
import type { CveAdvisory } from '#modules/cve-feed';
import { getGitDb } from '#lib/server/gitdb';
import { NotificationSettingsRepository } from '#modules/notifications/infrastructure/repositories/notification-settings.repository';
import { StateBackendRepository } from '#modules/state-iac/infrastructure/repositories/state-backend.repository';
import { StateBindingRepository } from '#modules/state-iac/infrastructure/repositories/state-binding.repository';
import { FAKE_S3_BUCKET } from './fake-s3';
import { E2E_S3_ENDPOINT } from '../global-setup';

export const E2E_PASSWORD = 'E2ePassword!123';
/** A feed advisory seeded for lodash (see the CVE feed spec). */
export const E2E_FEED_CVE_ID = 'CVE-2099-0001';
export const E2E_FEED_ALIAS = 'GHSA-e2e0-0001-0001';

export type PersonaKey =
  | 'clusterAdmin'
  | 'clusterUserNoAccess'
  | 'orgAdmin'
  | 'orgDeveloper'
  | 'orgOutsider'
  | 'orgNone'
  | 'orgProjectsReadOnly'
  | 'orgStateIacReader'
  | 'orgCveFeedReader'
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
  primaryProjectId: string;
  projectViewerRoleId: string;
  /** Second project of the primary org: shares the State IaC bucket with the primary one. */
  secondaryProjectSlug: string;
  stateBackendId: string;
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

function requireSeedSlug(slug: string | null, entity: string): string {
  if (!slug) throw new Error(`Seed ${entity} was created without a slug`);
  return slug;
}

export async function seedAll(): Promise<SeedOutput> {
  const clusterAdminRole = await roleService.createRole({
    name: 'GitOps Admin',
    slug: 'cluster-admin',
    scope: 'cluster',
    permissions: CLUSTER_ADMIN_PERMISSIONS,
  });
  const clusterUserRole = await roleService.createRole({
    name: 'GitOps User',
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
  await new NotificationSettingsRepository().setAllowedDomains(primaryOrg.id, ['example.com']);
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

  // sees the State IaC backends and their assignments, can't change them
  const orgStateIacReaderRole = await roleService.createRole({
    name: 'E2E Org State IaC Reader',
    slug: 'e2e-org-stateiac-reader',
    scope: 'organization',
    organizationId: primaryOrg.id,
    permissions: ['organization:stateiac:backends:read'],
  });
  const orgStateIacReader = await userAccessService.createOrganizationUser({
    organizationId: primaryOrg.id,
    username: 'e2e-org-stateiac-reader',
    password: E2E_PASSWORD,
    roleId: orgStateIacReaderRole.id,
    email: 'org-stateiac-reader@e2e.test',
  });

  // sees the CVE feed ("CVEs por tecnología" tab) but can't edit the watchlist or sync
  const orgCveFeedReaderRole = await roleService.createRole({
    name: 'E2E Org CVE Feed Reader',
    slug: 'e2e-org-cve-feed-reader',
    scope: 'organization',
    organizationId: primaryOrg.id,
    permissions: ['organization:cves:feed:read'],
  });
  const orgCveFeedReader = await userAccessService.createOrganizationUser({
    organizationId: primaryOrg.id,
    username: 'e2e-org-cve-feed-reader',
    password: E2E_PASSWORD,
    roleId: orgCveFeedReaderRole.id,
    email: 'org-cve-feed-reader@e2e.test',
  });

  // an advisory the feed already stored for lodash (the feed itself stays disabled in the suite,
  // so nothing external is ever called); it only shows up once an organization follows lodash
  const feedNow = new Date().toISOString();
  const advisory: CveAdvisory = {
    id: E2E_FEED_CVE_ID,
    aliases: [E2E_FEED_ALIAS],
    title: 'Command Injection in lodash',
    summary: 'Command injection through the template function',
    details: 'lodash versions prior to 4.17.21 are vulnerable to Command Injection.',
    severity: 'high',
    cvssScore: 7.2,
    cvssVector: null,
    cwe: ['CWE-77'],
    technologyIds: ['lodash'],
    affected: [
      {
        technologyId: 'lodash',
        ecosystem: 'npm',
        package: 'lodash',
        ranges: ['>=0 <4.17.21'],
        fixedVersions: ['4.17.21'],
      },
    ],
    fixedVersions: ['4.17.21'],
    references: ['https://github.com/advisories/GHSA-35jh-r3h4-6jhm'],
    sources: ['osv'],
    publishedAt: feedNow,
    modifiedAt: feedNow,
    kev: false,
    kevAddedAt: null,
    epssScore: null,
    epssPercentile: null,
    epssUpdatedAt: null,
    fingerprint: 'e2e',
    firstSeenAt: feedNow,
    updatedAt: feedNow,
  };
  await new CveFeedStoreRepository(() => getGitDb()).applyAdvisories({
    upsert: [advisory],
    deleteIds: [],
  });

  // --- primary project under the primary org ----------------------------------------------
  const primaryProject = await projectService.createProject({
    organizationId: primaryOrg.id,
    name: 'E2E Primary Project',
    slug: 'e2e-project',
    modules: { vault: true, codereport: true, stateiac: true, monitoring: true },
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
  await assignProjectRole(
    primaryProject.id,
    serverKeysNoDeleteUser.userId,
    serverKeysNoDeleteRole.id,
  );

  const serverKeysNoUpdateRole = await roleService.createRole({
    name: 'E2E Server Keys No Update',
    slug: 'e2e-server-keys-no-update',
    scope: 'project',
    projectId: primaryProject.id,
    permissions: ['project:project:read', 'project:server-keys:read', 'project:server-keys:create'],
  });
  const serverKeysNoUpdateUser = await bareUser('e2e-server-keys-no-update');
  await assignProjectRole(
    primaryProject.id,
    serverKeysNoUpdateUser.userId,
    serverKeysNoUpdateRole.id,
  );

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

  // --- State IaC: one bucket (the fake S3 over test/fixtures/state-iac), two projects ----------
  const secondaryProject = await projectService.createProject({
    organizationId: primaryOrg.id,
    name: 'E2E Secondary Project',
    slug: 'e2e-project-b',
    modules: { vault: false, codereport: false, stateiac: true, monitoring: false },
  });
  const now = new Date().toISOString();
  const stateBackendId = crypto.randomUUID();
  // written directly: the API refuses loopback endpoints on purpose (anti-SSRF)
  await new StateBackendRepository().create({
    id: stateBackendId,
    organizationId: primaryOrg.id,
    name: 'e2e-shared-state',
    engine: 'pulumi',
    provider: 's3',
    bucket: FAKE_S3_BUCKET,
    prefix: null,
    region: 'us-east-1',
    endpoint: E2E_S3_ENDPOINT,
    forcePathStyle: true,
    auth: 'ambient',
    credentials: null,
    enabled: true,
    lastScanAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  });
  const bindings = new StateBindingRepository();
  for (const [pulumiProject, projectId] of [
    ['acme-infra', primaryProject.id],
    ['acme-platform', secondaryProject.id],
  ] as const) {
    await bindings.create({
      id: crypto.randomUUID(),
      organizationId: primaryOrg.id,
      backendId: stateBackendId,
      pulumiProject,
      stacks: [],
      projectId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const seededService = await codeReportService.createService({
    project: requireSeedSlug(primaryProject.slug, 'primary project'),
    name: 'E2E Seeded Service',
  });
  // a service whose SBOM uses express: the CVE feed suggests it (see the CVE feed spec). Not the
  // seeded service: an analysis changes its page, which other specs rely on
  const inventoryService = await codeReportService.createService({
    project: requireSeedSlug(primaryProject.slug, 'primary project'),
    name: 'E2E Inventory Service',
  });
  const sbom = await codeReportAnalysisService.startAnalysis({
    serviceId: inventoryService.id,
    tool: 'sbom',
  });
  await codeReportAnalysisService.completeAnalysis(sbom.id, {
    result: {
      components: [{ name: 'express', version: '4.18.2', purl: 'pkg:npm/express@4.18.2' }],
    },
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
      orgStateIacReader: {
        userId: orgStateIacReader.userId,
        username: orgStateIacReader.username,
      },
      orgCveFeedReader: {
        userId: orgCveFeedReader.userId,
        username: orgCveFeedReader.username,
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
    primaryProjectSlug: requireSeedSlug(primaryProject.slug, 'primary project'),
    primaryProjectId: primaryProject.id,
    projectViewerRoleId,
    secondaryProjectSlug: requireSeedSlug(secondaryProject.slug, 'secondary project'),
    stateBackendId,
    outsiderOrgSlug: requireSeedSlug(outsiderOrg.slug, 'outsider organization'),
    outsiderProjectSlug: requireSeedSlug(outsiderProject.slug, 'outsider project'),
    seededServiceSlug: seededService.slug,
    apiKeys: {
      readOnly: readOnlyApiKeyToken,
      write: writeApiKeyToken,
      outsiderProject: outsiderApiKeyToken,
    },
  };
}
