export type Role = 'admin' | 'developer';

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

export type UserView = {
  id: string;
  username: string;
  email: string | null;
  role: RoleView;
  createdAt: string;
};

export type RoleView = {
  id: string;
  name: string;
  description: string;
  permissions: object;
  createdAt: string;
  updatedAt: string;
}

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  role: RoleView;
};

export type CreateUserInput = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: RoleView;
};

export type UpdateUserInput = {
  actorUserId: string;
  targetUserId: string;
  password?: string;
  role?: RoleView;
};

export type ApiKeyView = {
  id: string;
  name: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
