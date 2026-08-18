import { canAccessAdminArea, isAdmin } from './domain/rbac';
import { AuthService } from './application/auth.service';
import { ApiKeysService } from './application/apikeys.service';
import { PasswordService } from './application/password.service';
import { ProfileService } from './application/profile.service';
import { SessionService } from './application/session.service';
import { UserService } from './application/user.service';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { RoleRepository } from './infrastructure/repositories/role.repository';
import { ApiKeyRepository } from './infrastructure/repositories/apikey.repository';

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const apiKeyRepository = new ApiKeyRepository();

export const passwordService = new PasswordService();
const sessionService = new SessionService(passwordService);
export const apiKeysService = new ApiKeysService(apiKeyRepository);

export const authService = new AuthService(userRepository, passwordService, sessionService);
export const userService = new UserService(userRepository, roleRepository, passwordService);
export const profileService = new ProfileService(userRepository, passwordService, apiKeysService);

export { canAccessAdminArea, isAdmin };

// Bootstrap auth primitives once at startup.
const authBootstrap = authService.bootstrapDefaults();

export async function ensureAuthReady(): Promise<void> {
	await authBootstrap;
}
