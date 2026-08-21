import type { AuthenticatedUser } from './entities';
import { isAdmin } from '$lib/permissions';

export { can, canManageOrganization, hasPermission, isAdmin } from '$lib/permissions';
export type { Permission, PermissionGrant, PermissionSection, PermissionAction } from '$lib/permissions';

export function canAccessAdminArea(user: AuthenticatedUser | null | undefined): boolean {
  return isAdmin(user);
}
