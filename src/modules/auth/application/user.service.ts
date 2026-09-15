import crypto from 'crypto';
import type { Role, UpdateUserInput } from '../domain/entities';
import { UserRepository } from '../infrastructure/repositories/user.repository';
import { PasswordService } from './password.service';
import { eventBus, UserCreatedEvent, UserDeletedEvent } from '$modules/events';

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: any,
    private readonly passwordService: PasswordService,
  ) {}

  async listUsers(): Promise<any[]> {
    const users = await this.userRepository.listUsers();
    return users.map((user) => user.toJson());
  }

  async createUser(input: {
    username: string;
    password: string;
    role: Role;
    email?: string | null;
  }): Promise<any> {
    const userId = crypto.randomUUID();
    const role = this.roleRepository.getRoleByName(input.role);

    await this.userRepository.createUser({
      id: userId,
      username: input.username,
      email: input.email ?? null,
      passwordHash: this.passwordService.hashPassword(input.password),
      role: role,
    });

    const created = await this.userRepository.findById(userId);
    if (!created) {
      throw new Error('Failed to create user');
    }

    await eventBus.emit(
      new UserCreatedEvent({
        userId: created.id,
        username: created.username,
        email: created.email ?? null,
        scope: 'cluster',
        roleId: created.role?.id ?? null,
      }),
    );

    return {
      id: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt,
    };
  }

  async updateUser(input: UpdateUserInput): Promise<void> {
    if (input.password) {
      await this.userRepository.updatePassword(
        input.targetUserId,
        this.passwordService.hashPassword(input.password),
      );
    }

    if (input.role) {
      // if (input.targetUserId === input.actorUserId && input.role !== 'admin') {
      //   throw new Error('You cannot remove your own admin role.');
      // }
      // if (input.role !== 'admin') {
      //   await this.ensureNotRemovingLastAdmin(input.targetUserId);
      // }
      // await this.userRepository.updateRole(input.targetUserId, input.role);
    }
  }

  async deleteUser(actorUserId: string, targetUserId: string): Promise<void> {
    if (actorUserId === targetUserId) {
      throw new Error('You cannot delete your own account.');
    }

    await this.ensureNotRemovingLastAdmin(targetUserId);
    const target = await this.userRepository.findById(targetUserId);
    await this.userRepository.deleteById(targetUserId);

    await eventBus.emit(
      new UserDeletedEvent(
        { userId: targetUserId, username: target?.username ?? null, scope: 'cluster' },
        { actorId: actorUserId },
      ),
    );
  }

  private async ensureNotRemovingLastAdmin(targetUserId: string): Promise<void> {
    const targetUser = await this.userRepository.findById(targetUserId);
    const adminCount = await this.userRepository.countAdmins();

    if (targetUser?.role?.slug === 'admin' && adminCount <= 1) {
      throw new Error('At least one admin user is required.');
    }
  }
}
