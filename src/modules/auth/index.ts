import { databaseClient } from '$lib/db';
import { canAccessAdminArea, isAdmin } from './domain/rbac';
import { AuthService } from './application/auth.service';
import { PasswordService } from './application/password.service';
import { ProfileService } from './application/profile.service';
import { SessionService } from './application/session.service';
import { UserService } from './application/user.service';
import { SqliteAuthConfigRepository } from './infrastructure/repositories/sqlite-auth-config.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { RoleRepository } from './infrastructure/repositories/role.repository';

const authConfigRepository = new SqliteAuthConfigRepository(databaseClient);
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();

export const passwordService = new PasswordService(authConfigRepository);
const sessionService = new SessionService(passwordService);

export const authService = new AuthService(userRepository, passwordService, sessionService);
export const userService = new UserService(userRepository, roleRepository, passwordService);
export const profileService = new ProfileService(userRepository, passwordService);

export { canAccessAdminArea, isAdmin };

// Bootstrap auth primitives once at startup.
const authBootstrap = authService.bootstrapDefaults();

export async function ensureAuthReady(): Promise<void> {
	await authBootstrap;
}
