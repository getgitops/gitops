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

  const currentProjectSlug = url.pathname.match(/\/projects\/([^/]+)/)?.[1] ?? null;

  const projects = locals.user
    ? (
        await Promise.all(
          (await projectService.listProjects())
            .filter((project) => project.status === 'active')
            .map(async (project) => ({
              project,
              allowed: await cancanService.canSessionUser(locals.user, 'stateiac:read', {
                scope: 'project',
                projectId: project.id,
                organizationId: project.organization?.id,
              }),
            })),
        )
      )
        .filter(({ allowed }) => allowed)
        .map(({ project }) => project)
    : [];

  return {
    // isConfigured: !!config && backends.length > 0,
    isConfigured: true,
    // backends,
    // activeBackendId,
    user: locals.user,
    organization,
    projects,
    currentProjectSlug,
  };
}
