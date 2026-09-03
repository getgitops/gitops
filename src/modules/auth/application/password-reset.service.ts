import crypto from 'crypto';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { PasswordService } from './password.service';

export type PasswordResetNotifierPort = {
  sendPasswordReset(input: {
    email: string;
    username: string;
    resetUrl: string;
    expiresAt: string;
  }): Promise<void>;
};

const TOKEN_BYTES = 32;
const DEFAULT_TTL_HOURS = 1;

export class PasswordResetService {
  constructor(
    private readonly userRepository: Pick<
      UserRepository,
      'findByEmail' | 'findByPasswordResetTokenHash' | 'setPasswordResetToken' | 'resetPassword'
    >,
    private readonly passwordService: Pick<PasswordService, 'hashPassword'>,
    private readonly notifier: PasswordResetNotifierPort,
    private readonly ttlHours: number = DEFAULT_TTL_HOURS,
  ) {}

  /** Always resolves without leaking whether the email is registered. */
  async requestReset(email: string, resetUrlBase: string): Promise<void> {
    const value = email.trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('A valid email is required');
    }

    const user = await this.userRepository.findByEmail(value);
    if (!user || !user.email) return;

    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlHours * 3_600_000).toISOString();

    await this.userRepository.setPasswordResetToken(user.id, this.hashToken(token), expiresAt);

    await this.notifier.sendPasswordReset({
      email: user.email,
      username: user.username,
      resetUrl: this.buildResetUrl(resetUrlBase, token),
      expiresAt,
    });
  }

  async resetPassword(token: string, password: string): Promise<{ userId: string }> {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const user = await this.resolveUser(token);
    await this.userRepository.resetPassword(user.id, this.passwordService.hashPassword(password));

    return { userId: user.id };
  }

  private async resolveUser(token: string) {
    const value = token.trim();
    if (!value) throw new Error('Reset token is required');

    const user = await this.userRepository.findByPasswordResetTokenHash(this.hashToken(value));
    if (!user) throw new Error('This password reset link is no longer valid');
    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() <= Date.now()) {
      throw new Error('This password reset link has expired');
    }

    return user;
  }

  private buildResetUrl(baseUrl: string, token: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
