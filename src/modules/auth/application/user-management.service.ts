import crypto from 'crypto';
import type { Role, UpdateUserInput, UserView } from '../domain/entities';
import type { AuthUserRepository } from '../domain/repositories';
import { PasswordService } from './password.service';

export class UserManagementService {
  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  listUsers(): UserView[] {
    return this.userRepository.listUsers();
  }

  createUser(input: { username: string; password: string; role: Role; email?: string | null }): UserView {
    const userId = crypto.randomUUID();

    this.userRepository.createUser({
      id: userId,
      username: input.username,
      email: input.email ?? null,
      passwordHash: this.passwordService.hashPassword(input.password),
      role: input.role,
    });

    const created = this.userRepository.findById(userId);
    if (!created) {
      throw new Error('Failed to create user');
    }

    return {
      id: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt,
    };
  }

  updateUser(input: UpdateUserInput): void {
    if (input.password) {
      this.userRepository.updatePassword(
        input.targetUserId,
        this.passwordService.hashPassword(input.password),
      );
    }

    if (input.role) {
      if (input.targetUserId === input.actorUserId && input.role !== 'admin') {
        throw new Error('You cannot remove your own admin role.');
      }

      if (input.role !== 'admin') {
        this.ensureNotRemovingLastAdmin(input.targetUserId);
      }

      this.userRepository.updateRole(input.targetUserId, input.role);
    }
  }

  deleteUser(actorUserId: string, targetUserId: string): void {
    if (actorUserId === targetUserId) {
      throw new Error('You cannot delete your own account.');
    }

    this.ensureNotRemovingLastAdmin(targetUserId);
    this.userRepository.deleteById(targetUserId);
  }

  private ensureNotRemovingLastAdmin(targetUserId: string): void {
    const targetUser = this.userRepository.findById(targetUserId);
    const adminCount = this.userRepository.countAdmins();

    if (targetUser?.role === 'admin' && adminCount <= 1) {
      throw new Error('At least one admin user is required.');
    }
  }
}
