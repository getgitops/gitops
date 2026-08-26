import type { Handle } from '@sveltejs/kit';
import { authService, cancanService, ensureAuthReady } from './modules/auth';
import { ensureOrganizationReady, organizationService } from './modules/organization';
import { projectService } from './modules/projects';
import { getGitDb } from '$lib/server/gitdb';

getGitDb();

const authWithToken = async (token: string) => {
  return true;
};

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === '/login') {
    return resolve(event);
  }

  if (event.url.pathname.startsWith('/api/')) {
    const token = event.request.headers.get('Authorization') || '';
    if (!token || token.trim() === '') {
      return new Response(null, { status: 401 });
    }

    const isAuthenticated = await authWithToken(token);

    if (!isAuthenticated) {
      return new Response(null, { status: 401 });
    }
    console.log('✅ [API] Authenticated successfully with token:', token);
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
  } else if (event.url.pathname.startsWith('/cluster-settings')) {
    if (!cancanService.canAccessAdminArea(currentUser)) {
      return new Response(null, { status: 302, headers: { location: '/' } });
    }
  }

  return resolve(event);
};
