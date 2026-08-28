import { AuthService } from './application/auth.service';
import { ApiKeysService } from './application/apikeys.service';
import { PasswordService } from './application/password.service';
import { ProfileService } from './application/profile.service';
import { SessionService } from './application/session.service';
import { UserService } from './application/user.service';
import { UserAccessService } from './application/user-access.service';
import { InvitationService } from './application/invitation.service';
import { CanCanService } from './application/cancan.service';
import { RoleService } from './application/role.service';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { RoleRepository } from './infrastructure/repositories/role.repository';
import { ApiKeyRepository } from './infrastructure/repositories/apikey.repository';
import { UserAccessRepository } from './infrastructure/repositories/user-access.repository';
import { InvitationNotifier } from './infrastructure/notifications/invitation.notifier';
import { projectService } from '../projects';

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const apiKeyRepository = new ApiKeyRepository();
const userAccessRepository = new UserAccessRepository();
const invitationNotifier = new InvitationNotifier();

export const passwordService = new PasswordService();
const sessionService = new SessionService(passwordService);
export const apiKeysService = new ApiKeysService(apiKeyRepository, roleRepository, projectService);

export const authService = new AuthService(
  userRepository,
  roleRepository,
  passwordService,
  sessionService,
);
export const userService = new UserService(userRepository, roleRepository, passwordService);
export const profileService = new ProfileService(userRepository, passwordService);
export const roleService = new RoleService(roleRepository, userRepository, userAccessRepository);
export const invitationService = new InvitationService(
  userRepository,
  userAccessRepository,
  passwordService,
);
export const userAccessService = new UserAccessService(
  userRepository,
  roleRepository,
  userAccessRepository,
  passwordService,
  invitationNotifier,
  invitationService,
);
export const cancanService = new CanCanService(
  userRepository,
  userAccessRepository,
  projectService,
);

// Bootstrap auth primitives once, on first use, since it requires a configured GitDB repository.
let authBootstrap: Promise<void> | null = null;

export async function ensureAuthReady(): Promise<void> {
  if (!authBootstrap) {
    authBootstrap = authService.bootstrapDefaults().catch((error) => {
      authBootstrap = null;
      throw error;
    });
  }
  await authBootstrap;
}
