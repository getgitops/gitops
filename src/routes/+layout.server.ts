import { projectService } from '$modules/projects';
import { organizationService } from '$modules/organization';
import { cancanService } from '$modules/auth';
// import { configService, storageBackendService } from '$modules/config';

export async function load({ locals, url }) {
  // the setup wizard runs before GitDB exists, so none of the app-shell data can be loaded yet
  if (url.pathname.startsWith('/bootstrap')) {
    return {
      isConfigured: false,
      user: null,
      organization: null,
      projects: [],
      currentProjectSlug: null,
    };
  }

  // const config = configService.getConfig();
  // const backends = storageBackendService.list();

  // let activeBackendId = cookies.get('active_backend');
  // let activeBackend = backends.find((backend) => backend.id === activeBackendId);

  // if (!activeBackend && backends.length > 0) {
  //   activeBackend = backends[0];
  //   activeBackendId = activeBackend.id;
  // }

  const orgSlugFromUrl = url.pathname.match(/^\/org\/([^/]+)/)?.[1];
  const organization = orgSlugFromUrl
    ? await organizationService.tryFindBySlug(orgSlugFromUrl)
    : await organizationService.getDefaultOrganization();

  const canAccessClusterSettings = cancanService.canAccessAdminArea(locals.user);
  const canManageOrganization = organization
    ? await cancanService.canManageOrganization(locals.user, organization.id)
    : false;
  const canAdministerOrganization = organization
    ? await cancanService.canSessionUser(locals.user, 'organization:settings:all', {
        scope: 'organization',
        organizationId: organization.id,
      })
    : false;

  const orgSectionPermission = (permission: string) =>
    organization
      ? cancanService.canSessionUser(locals.user, permission, {
          scope: 'organization',
          organizationId: organization.id,
        })
      : Promise.resolve(false);

  const [
    canReadOrgProjects,
    canReadOrgUsers,
    canReadOrgRoles,
    canReadOrgGlobal,
    canReadOrgBackups,
    canReadOrgServerKeys,
    canReadOrgAudit,
  ] = await Promise.all([
    orgSectionPermission('organization:projects:read'),
    orgSectionPermission('organization:users:read'),
    orgSectionPermission('organization:roles:read'),
    orgSectionPermission('organization:settings:read'),
    orgSectionPermission('organization:backups:read'),
    orgSectionPermission('organization:server-keys:read'),
    orgSectionPermission('organization:audit:read'),
  ]);

  const currentProjectSlug = url.pathname.match(/\/projects\/([^/]+)/)?.[1] ?? null;

  const projects = locals.user
    ? (
        await Promise.all(
          (await projectService.listProjects())
            .filter((project) => project.status === 'active')
            .map(async (project) => ({
              project,
              allowed: await cancanService.canManageProject(
                locals.user,
                project.id,
                project.organization?.id,
              ),
            })),
        )
      )
        .filter(({ allowed }) => allowed)
        .map(({ project }) => project)
    : [];

  const projectSlugFromUrl = url.pathname.match(/^\/org\/[^/]+\/projects\/([^/]+)/)?.[1];
  const currentProject = projectSlugFromUrl
    ? projects.find((project) => project.slug === projectSlugFromUrl)
    : null;
  const canManageProject = currentProject
    ? await cancanService.canManageProject(
        locals.user,
        currentProject.id,
        currentProject.organization?.id,
      )
    : false;

  const projectSectionPermission = (permission: string) =>
    currentProject
      ? cancanService.canSessionUser(locals.user, permission, {
          scope: 'project',
          projectId: currentProject.id,
          organizationId: currentProject.organization?.id,
        })
      : Promise.resolve(false);

  const [
    canReadProjectInfo,
    canReadProjectUsers,
    canReadProjectRoles,
    canReadProjectServerKeys,
    canReadProjectAudit,
    canReadProjectVaultSecrets,
    canReadProjectVaultEnvironments,
    canReadProjectCodeReportReports,
    canReadProjectCodeReportDependencies,
    canReadProjectCodeReportVulnerabilities,
    canReadProjectStateIacStacks,
    canReadProjectStateIacStates,
    canReadProjectStateIacHistory,
  ] = await Promise.all([
    projectSectionPermission('project:project:read'),
    projectSectionPermission('project:users:read'),
    projectSectionPermission('project:roles:read'),
    projectSectionPermission('project:server-keys:read'),
    projectSectionPermission('project:audit:read'),
    projectSectionPermission('project:vault:secrets:read'),
    projectSectionPermission('project:vault:environments:read'),
    projectSectionPermission('project:codereport:reports:read'),
    projectSectionPermission('project:codereport:dependencies:read'),
    projectSectionPermission('project:codereport:vulnerabilities:read'),
    projectSectionPermission('project:stateiac:stacks:read'),
    projectSectionPermission('project:stateiac:states:read'),
    projectSectionPermission('project:stateiac:history:read'),
  ]);

  const canReadProjectVault = canReadProjectVaultSecrets || canReadProjectVaultEnvironments;
  const canReadProjectCodeReport =
    canReadProjectCodeReportReports ||
    canReadProjectCodeReportDependencies ||
    canReadProjectCodeReportVulnerabilities;
  const canReadProjectStateIac =
    canReadProjectStateIacStacks || canReadProjectStateIacStates || canReadProjectStateIacHistory;

  return {
    // isConfigured: !!config && backends.length > 0,
    isConfigured: true,
    // backends,
    // activeBackendId,
    user: locals.user,
    organization,
    projects,
    canAccessClusterSettings,
    canViewGitDbStatus: canAccessClusterSettings || canAdministerOrganization,
    canManageOrganization,
    canManageProject,
    canReadOrgProjects,
    canReadOrgUsers,
    canReadOrgRoles,
    canReadOrgGlobal,
    canReadOrgBackups,
    canReadOrgServerKeys,
    canReadOrgAudit,
    canReadProjectInfo,
    canReadProjectUsers,
    canReadProjectRoles,
    canReadProjectServerKeys,
    canReadProjectAudit,
    canReadProjectVault,
    canReadProjectCodeReport,
    canReadProjectStateIac,
    currentProjectSlug,
  };
}
