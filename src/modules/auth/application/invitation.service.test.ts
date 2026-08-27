import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { InvitationService } from './invitation.service';
import { UserDomain } from '../domain/user.domain';

function hash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class FakeUserRepository {
  rows: UserDomain[] = [];
  tokens = new Map<string, string>();
  accepted: Array<{ userId: string; passwordHash: string }> = [];

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findByInvitationTokenHash(tokenHash: string) {
    const userId = [...this.tokens.entries()].find(([, value]) => value === tokenHash)?.[0];
    return userId ? this.findById(userId) : null;
  }

  async setInvitationToken(userId: string, tokenHash: string, expiresAt: string) {
    this.tokens.set(userId, tokenHash);
    const user = this.rows.find((entry) => entry.id === userId);
    if (user) user.invitationExpiresAt = new Date(expiresAt);
  }

  async acceptInvitation(userId: string, passwordHash: string) {
    this.accepted.push({ userId, passwordHash });
    this.tokens.delete(userId);
    const user = this.rows.find((entry) => entry.id === userId);
    if (user) {
      user.status = 'active';
      user.password = passwordHash;
      user.invitationExpiresAt = null;
    }
  }
}

class FakeUserAccessRepository {
  rows: Array<{ id: string; userId: string; status: 'active' | 'invited' }> = [];

  async findByUserId(userId: string) {
    return this.rows.filter((entry) => entry.userId === userId) as any;
  }

  async update(id: string, changes: { status?: 'active' | 'invited' }) {
    const entry = this.rows.find((row) => row.id === id);
    if (entry && changes.status) entry.status = changes.status;
  }
}

function invitedUser(id = 'jose-id') {
  return new UserDomain({
    id,
    username: 'jose',
    email: 'jose@example.com',
    password: 'placeholder',
    status: 'invited',
    role: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

describe('InvitationService', () => {
  let userRepository: FakeUserRepository;
  let userAccessRepository: FakeUserAccessRepository;
  let service: InvitationService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    userAccessRepository = new FakeUserAccessRepository();
    service = new InvitationService(userRepository as any, userAccessRepository as any, {
      hashPassword: (password: string) => `hashed:${password}`,
    });
    userRepository.rows.push(invitedUser());
  });

  describe('issueToken', () => {
    it('stores only the token hash and returns the raw token', async () => {
      const { token, expiresAt } = await service.issueToken('jose-id');

      expect(token).not.toBe('');
      expect(userRepository.tokens.get('jose-id')).toBe(hash(token));
      expect(userRepository.tokens.get('jose-id')).not.toBe(token);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('replaces a previously issued token', async () => {
      const first = await service.issueToken('jose-id');
      const second = await service.issueToken('jose-id');

      expect(second.token).not.toBe(first.token);
      await expect(service.findByToken(first.token)).rejects.toThrow(/no longer valid/);
      await expect(service.findByToken(second.token)).resolves.toMatchObject({
        userId: 'jose-id',
      });
    });
  });

  describe('findByToken', () => {
    it('resolves the invited user', async () => {
      const { token } = await service.issueToken('jose-id');

      await expect(service.findByToken(token)).resolves.toEqual({
        userId: 'jose-id',
        username: 'jose',
        email: 'jose@example.com',
      });
    });

    it('rejects an empty token', async () => {
      await expect(service.findByToken('   ')).rejects.toThrow(/token is required/);
    });

    it('rejects an unknown token', async () => {
      await expect(service.findByToken('nope')).rejects.toThrow(/no longer valid/);
    });

    it('rejects an expired token', async () => {
      const expired = new InvitationService(
        userRepository as any,
        userAccessRepository as any,
        { hashPassword: (password: string) => `hashed:${password}` },
        -1,
      );
      const { token } = await expired.issueToken('jose-id');

      await expect(expired.findByToken(token)).rejects.toThrow(/expired/);
    });

    it('rejects a token belonging to an already active user', async () => {
      const { token } = await service.issueToken('jose-id');
      userRepository.rows[0].status = 'active';

      await expect(service.findByToken(token)).rejects.toThrow(/no longer valid/);
    });
  });

  describe('acceptInvitation', () => {
    it('sets the password, activates the user and clears the token', async () => {
      const { token } = await service.issueToken('jose-id');

      await expect(service.acceptInvitation(token, 'sup3rsecret')).resolves.toMatchObject({
        userId: 'jose-id',
      });

      expect(userRepository.accepted).toEqual([
        { userId: 'jose-id', passwordHash: 'hashed:sup3rsecret' },
      ]);
      expect(userRepository.tokens.has('jose-id')).toBe(false);
      expect(userRepository.rows[0].status).toBe('active');
    });

    it('activates every invited access row of the user', async () => {
      userAccessRepository.rows.push(
        { id: 'access-1', userId: 'jose-id', status: 'invited' },
        { id: 'access-2', userId: 'jose-id', status: 'active' },
        { id: 'access-3', userId: 'other-id', status: 'invited' },
      );
      const { token } = await service.issueToken('jose-id');

      await service.acceptInvitation(token, 'sup3rsecret');

      expect(userAccessRepository.rows.map((row) => row.status)).toEqual([
        'active',
        'active',
        'invited',
      ]);
    });

    it('rejects a short password without consuming the token', async () => {
      const { token } = await service.issueToken('jose-id');

      await expect(service.acceptInvitation(token, 'short')).rejects.toThrow(/at least 8/);
      expect(userRepository.accepted).toEqual([]);
      expect(userRepository.tokens.has('jose-id')).toBe(true);
    });

    it('cannot be replayed with the same token', async () => {
      const { token } = await service.issueToken('jose-id');
      await service.acceptInvitation(token, 'sup3rsecret');

      await expect(service.acceptInvitation(token, 'sup3rsecret')).rejects.toThrow(
        /no longer valid/,
      );
    });
  });
});
