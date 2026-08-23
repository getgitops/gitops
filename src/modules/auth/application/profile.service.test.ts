import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileService } from './profile.service';
import type { PasswordService } from './password.service';
import type { UserRepository } from '../infrastructure/repositories/user.repository';

function createUserRepositoryMock() {
  return {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
    updateRole: vi.fn(),
    deleteById: vi.fn(),
    countAdmins: vi.fn(),
    listActiveApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    revokeApiKey: vi.fn(),
  } as unknown as UserRepository;
}

function createPasswordServiceMock() {
  return {
    ensureEncryptionKey: vi.fn(),
    hashPassword: vi.fn(),
    verifyPassword: vi.fn(),
  } as unknown as PasswordService;
}

describe('ProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated user profile as JSON', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    const user = {
      toJson: vi.fn().mockReturnValue({
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: { id: 'role-1', name: 'Developer' },
        createdAt: '2026-08-18T00:00:00.000Z',
      }),
    };

    userRepository.findById.mockResolvedValue(user);

    await expect(service.getAuthenticatedUserProfile('user-1')).resolves.toEqual({
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: { id: 'role-1', name: 'Developer' },
      createdAt: '2026-08-18T00:00:00.000Z',
    });

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(user.toJson).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user profile does not exist', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    userRepository.findById.mockResolvedValue(null);

    await expect(service.getAuthenticatedUserProfile('missing-user')).resolves.toBeNull();
    expect(userRepository.findById).toHaveBeenCalledWith('missing-user');
  });

  it('updates the email address', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    await service.updateEmail('user-1', 'new@example.com');

    expect(userRepository.updateEmail).toHaveBeenCalledWith('user-1', 'new@example.com');
  });

  it('changes the password when the current password is valid', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    userRepository.findById.mockResolvedValue({
      password: 'hashed-current',
    });
    passwordService.verifyPassword.mockReturnValue(true);
    passwordService.hashPassword.mockReturnValue('hashed-new');

    await expect(service.changePassword('user-1', 'current-pass', 'new-pass')).resolves.toBe(true);
    expect(passwordService.verifyPassword).toHaveBeenCalledWith('current-pass', 'hashed-current');
    expect(passwordService.hashPassword).toHaveBeenCalledWith('new-pass');
    expect(userRepository.updatePassword).toHaveBeenCalledWith('user-1', 'hashed-new');
  });

  it('returns false when the current password is invalid', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    userRepository.findById.mockResolvedValue({
      password: 'hashed-current',
    });
    passwordService.verifyPassword.mockReturnValue(false);

    await expect(service.changePassword('user-1', 'wrong-pass', 'new-pass')).resolves.toBe(false);
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
    expect(passwordService.hashPassword).not.toHaveBeenCalled();
  });

  it('returns false when the user does not exist', async () => {
    const userRepository = createUserRepositoryMock();
    const passwordService = createPasswordServiceMock();
    const service = new ProfileService(userRepository, passwordService);

    userRepository.findById.mockResolvedValue(null);

    await expect(service.changePassword('missing-user', 'current-pass', 'new-pass')).resolves.toBe(
      false,
    );
    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });
});
