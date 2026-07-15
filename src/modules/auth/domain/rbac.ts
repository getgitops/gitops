import type { AuthenticatedUser } from './entities';

export function isAdmin(user: AuthenticatedUser | null | undefined): boolean {
  return user?.role === 'admin';
}

export function canAccessAdminArea(user: AuthenticatedUser | null | undefined): boolean {
  return isAdmin(user);
}
