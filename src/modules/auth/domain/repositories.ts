import type { AuthUser, CreateUserInput, Role, UserView } from './entities';

export interface AuthConfigRepository {
  findEncryptionKey(): string | null;
  saveEncryptionKey(key: string): void;
}

export interface AuthUserRepository {
  findById(id: string): Promise<AuthUser | null>;
  findByUsername(username: string): Promise<AuthUser | null>;
  listUsers(): Promise<UserView[]>;
  createUser(input: CreateUserInput): Promise<void>;
  updateEmail(userId: string, email: string | null): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateRole(userId: string, role: Role): Promise<void>;
  deleteById(userId: string): Promise<void>;
  countAdmins(): Promise<number>;
  listActiveApiKeys(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      keyPrefix: string;
      lastUsedAt: string | null;
      createdAt: string;
    }>
  >;
  createApiKey(input: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
  }): Promise<void>;
  revokeApiKey(userId: string, keyId: string): Promise<void>;
}
