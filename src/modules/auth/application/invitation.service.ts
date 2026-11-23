import crypto from 'crypto';
import type { UserAccessRepository } from '../infrastructure/repositories/user-access.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { PasswordService } from './password.service';
import { publishAfterWrite } from '#lib/server/events/publish';
import { resolveProjectScope } from '#lib/server/events/scope';
import { createLogger } from '#lib/server/logger';
import type { AccessEventsOptions } from './user-access.service';

const log = createLogger('invitation');

export type InvitationView = {
  userId: string;
  username: string;
  email: string | null;
};

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 7;

export class InvitationService {
  constructor(
    private readonly userRepository: Pick<
      UserRepository,
      'findById' | 'findByInvitationTokenHash' | 'setInvitationToken' | 'acceptInvitation'
    >,
    private readonly userAccessRepository: Pick<UserAccessRepository, 'findByUserId' | 'update'>,
    private readonly passwordService: Pick<PasswordService, 'hashPassword'>,
    private readonly ttlDays: number = DEFAULT_TTL_DAYS,
    private readonly eventOptions: AccessEventsOptions = {},
  ) {}

  /** Issues a new token, stores only its hash, and returns the raw token for the invite link. */
  async issueToken(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000).toISOString();

    await this.userRepository.setInvitationToken(userId, this.hashToken(token), expiresAt);
    return { token, expiresAt };
  }

  async findByToken(token: string): Promise<InvitationView> {
    const user = await this.resolveInvitedUser(token);
    return { userId: user.id, username: user.username, email: user.email };
  }

  async acceptInvitation(token: string, password: string): Promise<InvitationView> {
    const user = await this.resolveInvitedUser(token);

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    await this.userRepository.acceptInvitation(
      user.id,
      this.passwordService.hashPassword(password),
    );

    const access = await this.userAccessRepository.findByUserId(user.id);
    const accepted = access.filter((entry) => entry.status === 'invited');
    await Promise.all(
      accepted.map((entry) => this.userAccessRepository.update(entry.id, { status: 'active' })),
    );

    // one event per activated membership, so each organization/project sees its own
    for (const entry of accepted) {
      await publishAfterWrite(
        this.eventOptions.events,
        log,
        'invitation.accepted',
        { userId: user.id, accessId: entry.id, roleId: entry.roleId || null, scope: entry.scope },
        async () =>
          entry.scope === 'project'
            ? resolveProjectScope(entry.projectId, this.eventOptions.projects)
            : { organizationId: entry.organizationId ?? null, projectId: null },
      );
    }

    return { userId: user.id, username: user.username, email: user.email };
  }

  private async resolveInvitedUser(token: string) {
    const value = token.trim();
    if (!value) throw new Error('Invitation token is required');

    const user = await this.userRepository.findByInvitationTokenHash(this.hashToken(value));
    if (!user || user.status !== 'invited') {
      throw new Error('This invitation is no longer valid');
    }
    if (!user.invitationExpiresAt || user.invitationExpiresAt.getTime() <= Date.now()) {
      throw new Error('This invitation has expired');
    }

    return user;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
