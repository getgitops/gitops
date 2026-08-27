import { isRepositoryConfigured } from '$lib/server/gitdb';

export type BootstrapState = {
  administrator: boolean;
  organization: boolean;
  completed: boolean;
};

export type BootstrapStep = 'administrator' | 'organization';

const PENDING: BootstrapState = { administrator: false, organization: false, completed: false };

// evaluated at startup and after each wizard step, never on the request path
let state: BootstrapState = PENDING;

export function getBootstrapState(): BootstrapState {
  return state;
}

/** True once the cluster has an administrator and an organization. Cheap, in-memory. */
export function isBootstrapCompleted(): boolean {
  return state.completed;
}

export async function refreshBootstrapState(): Promise<BootstrapState> {
  if (!isRepositoryConfigured()) {
    state = PENDING;
    return state;
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

  const administrator = users.some(
    (user: any) => adminRoleIds.has(user.role?.id) || user.role?.slug === 'cluster-admin',
  );
  const organization = organizations.length > 0;

  state = { administrator, organization, completed: administrator && organization };
  console.info('[bootstrap] state', state);
  return state;
}

export function nextBootstrapStep(current: BootstrapState): BootstrapStep {
  return current.administrator ? 'organization' : 'administrator';
}
