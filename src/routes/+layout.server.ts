import { projectService } from '../modules/projects';
import { organizationService } from '../modules/organization';
import { can } from '../modules/auth';
// import { configService, storageBackendService } from '../modules/config';

export async function load({ locals, url }) {
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

  const projects =
    locals.user && can(locals.user, 'stateiac:read')
      ? (await projectService.listProjects()).filter((project) => project.status === 'active')
      : [];

  return {
    // isConfigured: !!config && backends.length > 0,
    isConfigured: true,
    // backends,
    // activeBackendId,
    user: locals.user,
    organization,
    projects,
  };
}
