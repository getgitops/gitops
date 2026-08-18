import { canAccessAdminArea, isAdmin, can, hasPermission } from './domain/rbac';
import { AuthService } from './application/auth.service';
import { PasswordService } from './application/password.service';
import { ProfileService } from './application/profile.service';
import { SessionService } from './application/session.service';
import { UserService } from './application/user.service';
import { RoleService } from './application/role.service';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { RoleRepository } from './infrastructure/repositories/role.repository';

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();

export const passwordService = new PasswordService();
const sessionService = new SessionService(passwordService);

export const authService = new AuthService(userRepository, passwordService, sessionService);
export const userService = new UserService(userRepository, roleRepository, passwordService);
export const profileService = new ProfileService(userRepository, passwordService);
export const roleService = new RoleService(roleRepository, userRepository);

export { canAccessAdminArea, isAdmin, can, hasPermission };

// Bootstrap auth primitives once at startup.
const authBootstrap = authService.bootstrapDefaults();

export async function ensureAuthReady(): Promise<void> {
	await authBootstrap;
}
