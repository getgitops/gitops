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
  role: Role;
  createdAt: string;
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  role: Role;
};

export type CreateUserInput = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: Role;
};

export type UpdateUserInput = {
  actorUserId: string;
  targetUserId: string;
  password?: string;
  role?: Role;
};

export type ApiKeyView = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};
