import type { AuthUser, CreateUserInput, Role, UserView } from './entities';

export interface AuthConfigRepository {
  findEncryptionKey(): string | null;
  saveEncryptionKey(key: string): void;
}

export interface AuthUserRepository {
  findById(id: string): AuthUser | null;
  findByUsername(username: string): AuthUser | null;
  listUsers(): UserView[];
  createUser(input: CreateUserInput): void;
  updateEmail(userId: string, email: string | null): void;
  updatePassword(userId: string, passwordHash: string): void;
  updateRole(userId: string, role: Role): void;
  deleteById(userId: string): void;
  countAdmins(): number;
  listActiveApiKeys(userId: string): Array<{
    id: string;
    name: string;
    keyPrefix: string;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
  createApiKey(input: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
  }): void;
  revokeApiKey(userId: string, keyId: string): void;
}
