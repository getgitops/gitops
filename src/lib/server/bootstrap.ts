import { isRepositoryConfigured } from '$lib/server/gitdb';

export type BootstrapState = {
  repository: boolean;
  administrator: boolean;
  organization: boolean;
  completed: boolean;
};

export type BootstrapStep = 'repository' | 'administrator' | 'organization';

const EMPTY: BootstrapState = {
  repository: false,
  administrator: false,
  organization: false,
  completed: false,
};

let cachedCompleted = false;

export async function getBootstrapState(): Promise<BootstrapState> {
  if (!isRepositoryConfigured()) {
    cachedCompleted = false;
    return EMPTY;
  }

  // imported lazily: these modules instantiate repositories bound to the GitDB client
  const [{ roleService, userService }, { organizationService }] = await Promise.all([
    import('$modules/auth'),
    import('$modules/organization'),
  ]);

  const [roles, users, organizations] = await Promise.all([
    roleService.listRoles('cluster'),
    userService.listUsers(),
    organizationService.listOrganizations(),
  ]);

  const adminRoleIds = new Set(
    roles.filter((role: any) => role.slug === 'cluster-admin').map((role: any) => role.id),
  );

  const state: BootstrapState = {
    repository: true,
    administrator: users.some(
      (user: any) => adminRoleIds.has(user.role?.id) || user.role?.slug === 'cluster-admin',
    ),
    organization: organizations.length > 0,
    completed: false,
  };
  state.completed = state.repository && state.administrator && state.organization;
  cachedCompleted = state.completed;
  return state;
}

/** Fast path for the request hook: once completed, the state can never regress. */
export function isBootstrapCompletedCached(): boolean {
  return cachedCompleted && isRepositoryConfigured();
}

export function nextBootstrapStep(state: BootstrapState): BootstrapStep {
  if (!state.repository) return 'repository';
  if (!state.administrator) return 'administrator';
  return 'organization';
}
