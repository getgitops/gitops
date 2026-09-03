import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetService } from './password-reset.service';
import { UserDomain } from '../domain/user.domain';

class FakeUserRepository {
  rows: UserDomain[] = [];
  tokens = new Map<string, string>();
  reset: Array<{ userId: string; passwordHash: string }> = [];

  async findByEmail(email: string) {
    return this.rows.find((entry) => entry.email === email) ?? null;
  }

  async findByPasswordResetTokenHash(tokenHash: string) {
    const userId = [...this.tokens.entries()].find(([, value]) => value === tokenHash)?.[0];
    return userId ? (this.rows.find((entry) => entry.id === userId) ?? null) : null;
  }

  async setPasswordResetToken(userId: string, tokenHash: string, expiresAt: string) {
    this.tokens.set(userId, tokenHash);
    const user = this.rows.find((entry) => entry.id === userId);
    if (user) user.passwordResetExpiresAt = new Date(expiresAt);
  }

  async resetPassword(userId: string, passwordHash: string) {
    this.reset.push({ userId, passwordHash });
    this.tokens.delete(userId);
    const user = this.rows.find((entry) => entry.id === userId);
    if (user) {
      user.password = passwordHash;
      user.passwordResetExpiresAt = null;
    }
  }
}

function activeUser(id = 'jose-id') {
  return new UserDomain({
    id,
    username: 'jose',
    email: 'jose@example.com',
    password: 'placeholder',
    status: 'active',
    role: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

describe('PasswordResetService', () => {
  let userRepository: FakeUserRepository;
  let notifier: { sendPasswordReset: ReturnType<typeof vi.fn> };
  let service: PasswordResetService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    notifier = { sendPasswordReset: vi.fn(async () => {}) };
    service = new PasswordResetService(
      userRepository as any,
      { hashPassword: (password: string) => `hashed:${password}` },
      notifier as any,
    );
    userRepository.rows.push(activeUser());
  });

  describe('requestReset', () => {
    it('issues a token and notifies the user', async () => {
      await service.requestReset('jose@example.com', 'https://app.local/auth/reset-password');

      expect(userRepository.tokens.get('jose-id')).toBeDefined();
      expect(notifier.sendPasswordReset).toHaveBeenCalledTimes(1);
      const call = notifier.sendPasswordReset.mock.calls[0]?.[0];
      expect(call.email).toBe('jose@example.com');
      expect(call.resetUrl).toContain('https://app.local/auth/reset-password?token=');
    });

    it('rejects an invalid email', async () => {
      await expect(service.requestReset('not-an-email', 'https://app.local/reset')).rejects.toThrow(
        /valid email/,
      );
      expect(notifier.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('silently no-ops for an unknown email, without leaking existence', async () => {
      await expect(
        service.requestReset('nobody@example.com', 'https://app.local/reset'),
      ).resolves.toBeUndefined();
      expect(notifier.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and clears the token', async () => {
      await service.requestReset('jose@example.com', 'https://app.local/auth/reset-password');
      const call = notifier.sendPasswordReset.mock.calls[0]?.[0];
      const token = new URL(call.resetUrl).searchParams.get('token') as string;

      await expect(service.resetPassword(token, 'sup3rsecret')).resolves.toEqual({
        userId: 'jose-id',
      });
      expect(userRepository.reset).toEqual([{ userId: 'jose-id', passwordHash: 'hashed:sup3rsecret' }]);
      expect(userRepository.tokens.get('jose-id')).toBeUndefined();
    });

    it('rejects a short password', async () => {
      await service.requestReset('jose@example.com', 'https://app.local/auth/reset-password');
      const call = notifier.sendPasswordReset.mock.calls[0]?.[0];
      const token = new URL(call.resetUrl).searchParams.get('token') as string;

      await expect(service.resetPassword(token, 'short')).rejects.toThrow(/at least 8 characters/);
    });

    it('rejects an empty token', async () => {
      await expect(service.resetPassword('   ', 'sup3rsecret')).rejects.toThrow(
        /token is required/,
      );
    });

    it('rejects an unknown token', async () => {
      await expect(service.resetPassword('nope', 'sup3rsecret')).rejects.toThrow(/no longer valid/);
    });

    it('rejects an expired token', async () => {
      const expired = new PasswordResetService(
        userRepository as any,
        { hashPassword: (password: string) => `hashed:${password}` },
        notifier as any,
        -1,
      );
      await expired.requestReset('jose@example.com', 'https://app.local/auth/reset-password');
      const call = notifier.sendPasswordReset.mock.calls[0]?.[0];
      const token = new URL(call.resetUrl).searchParams.get('token') as string;

      await expect(expired.resetPassword(token, 'sup3rsecret')).rejects.toThrow(/expired/);
    });
  });
});
