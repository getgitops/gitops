import { Repository } from './repository';
import { ApiKeyEntity, UserEntity } from '$lib/database/schemas';
import type { CreateUserInput } from '../../domain/entities';

import { UserDomain } from '../../domain/user.domain';

export class UserRepository extends Repository {
  async findById(id: string): Promise<UserDomain | null> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .where({ id })
      .limit(1);
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<UserDomain | null> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .where({ username })
      .limit(1);
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<UserDomain | null> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .where({ email })
      .limit(1);
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByInvitationTokenHash(invitationTokenHash: string): Promise<UserDomain | null> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .where({ invitationTokenHash })
      .limit(1);
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByPasswordResetTokenHash(passwordResetTokenHash: string): Promise<UserDomain | null> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .where({ passwordResetTokenHash })
      .limit(1);
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listUsers(): Promise<UserDomain[]> {
    const result = await this.db
      .with({ role: true })
      .select()
      .from(UserEntity)
      .orderBy('createdAt', 'desc');
    return result.rows.map((row) => this.toDomain(row));
  }

  async createUser(input: CreateUserInput): Promise<void> {
    const existing = await this.findByUsername(input.username);
    if (existing) {
      throw new Error('Username already exists');
    }

    await this.db.insert(UserEntity).values({
      id: input.id,
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      roleId: input.role.id,
      status: input.status ?? 'active',
      authProviders: [{ provider: 'local', providerId: null }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      disabled: false,
      lastLoginAt: null,
    });
  }

  async updateEmail(userId: string, email: string | null): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ email, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async updateRoleId(userId: string, roleId: string): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ roleId, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async updateStatus(userId: string, status: 'active' | 'invited'): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ status, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async setInvitationToken(
    userId: string,
    invitationTokenHash: string,
    invitationExpiresAt: string,
  ): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ invitationTokenHash, invitationExpiresAt, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async acceptInvitation(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({
        passwordHash,
        status: 'active',
        invitationTokenHash: null,
        invitationExpiresAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where({ id: userId });
  }

  async setPasswordResetToken(
    userId: string,
    passwordResetTokenHash: string,
    passwordResetExpiresAt: string,
  ): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({ passwordResetTokenHash, passwordResetExpiresAt, updatedAt: new Date().toISOString() })
      .where({ id: userId });
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(UserEntity)
      .set({
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where({ id: userId });
  }

  async deleteById(userId: string): Promise<void> {
    await this.db.delete(ApiKeyEntity).where({ userId });
    await this.db.delete(UserEntity).where({ id: userId });
  }

  async countByRoleId(roleId: string): Promise<number> {
    const result = await this.db.select().from(UserEntity).where({ roleId });
    return result.rows.length;
  }

  async countAdmins(): Promise<number> {
    // const result = await this.db.with({ role: true }).select().from(UserEntity);
    // return (result.rows as UserRow[]).filter((row) => this.extractRole(row) === 'admin').length;
    return 0; // Placeholder until role extraction is implemented
  }
  protected toDomain(user: any): UserDomain {
    return new UserDomain({
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      password: user.passwordHash,
      status: user.status,
      invitationExpiresAt: user.invitationExpiresAt ?? null,
      passwordResetExpiresAt: user.passwordResetExpiresAt ?? null,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  protected toJSON(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
