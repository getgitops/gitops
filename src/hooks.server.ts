import type { Handle } from '@sveltejs/kit';
import { authService, cancanService, ensureAuthReady } from './modules/auth';
import { ensureOrganizationReady, organizationService } from './modules/organization';
import { projectService } from './modules/projects';
import { getGitDb } from '$lib/server/gitdb';

getGitDb();

export const handle: Handle = async ({ event, resolve }) => {
  if (
    event.url.pathname === '/login' ||
    event.url.pathname.startsWith('/api/auth/') ||
    event.url.pathname === '/api/code-report/analyse-result'
  ) {
    return resolve(event);
  }

  await ensureAuthReady();
  await ensureOrganizationReady();

  const sessionCookie = event.cookies.get('pos_session');
  const currentUser = await authService.resolveAuthenticatedUser(sessionCookie);

  if (currentUser) {
    event.locals.user = currentUser;
  }

  if (!currentUser) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  const projectSettingsMatch = event.url.pathname.match(
    /^\/org\/[^/]+\/projects\/([^/]+)\/settings/,
  );
  const organizationSettingsMatch = event.url.pathname.match(/^\/org\/([^/]+)\/settings/);

  if (projectSettingsMatch) {
    const project = await projectService.tryFindBySlug(projectSettingsMatch[1]);
    if (
      !project ||
      !(await cancanService.canManageProject(currentUser, project.id, project.organization?.id))
    ) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  } else if (organizationSettingsMatch) {
    const organization = await organizationService.tryFindBySlug(organizationSettingsMatch[1]);
    if (
      !organization ||
      !(await cancanService.canManageOrganization(currentUser, organization.id))
    ) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  } else if (
    event.url.pathname.startsWith('/cluster-settings') ||
    event.url.pathname.startsWith('/api/system') ||
    event.url.pathname.startsWith('/api/organizations')
  ) {
    if (!cancanService.canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  }

  return resolve(event);
};
