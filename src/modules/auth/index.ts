import { databaseClient } from '$lib/db';
import { canAccessAdminArea, isAdmin } from './domain/rbac';
import { AuthService } from './application/auth.service';
import { PasswordService } from './application/password.service';
import { ProfileService } from './application/profile.service';
import { SessionService } from './application/session.service';
import { UserManagementService } from './application/user-management.service';
import { SqliteAuthConfigRepository } from './infrastructure/repositories/sqlite-auth-config.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';

const authConfigRepository = new SqliteAuthConfigRepository(databaseClient);
const authUserRepository = new UserRepository();

export const passwordService = new PasswordService(authConfigRepository);
const sessionService = new SessionService(passwordService);

export const authService = new AuthService(authUserRepository, passwordService, sessionService);
export const userManagementService = new UserManagementService(authUserRepository, passwordService);
export const profileService = new ProfileService(authUserRepository, passwordService);

export { canAccessAdminArea, isAdmin };

// Bootstrap auth primitives once at startup.
const authBootstrap = authService.bootstrapDefaults();

export async function ensureAuthReady(): Promise<void> {
	await authBootstrap;
}
