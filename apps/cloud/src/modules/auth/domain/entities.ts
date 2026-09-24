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
  slug: string;
  scope: 'cluster' | 'organization' | 'project';
  organizationId: string | null;
  projectId: string | null;
  description?: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type SessionRole = {
  id: string;
  name: string;
  slug: string;
  scope: 'cluster' | 'organization' | 'project';
  organizationId: string | null;
  projectId: string | null;
  permissions: string[];
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  role: SessionRole | null;
};

export type CreateUserInput = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: RoleView;
  status?: 'active' | 'invited';
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
  userId: string | null;
  projectId: string | null;
  roleId: string | null;
  createdByUserId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** Identity resolved from an `Authorization: Bearer` API key, the machine-to-machine counterpart of `AuthenticatedUser`. */
export type AuthenticatedApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  projectId: string | null;
  organizationId: string | null;
  userId: string | null;
  role: SessionRole | null;
};
