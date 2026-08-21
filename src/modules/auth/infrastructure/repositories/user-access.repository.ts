import { UserAccessEntity } from '$lib/database/schemas';
import { UserAccessDomain, type UserAccessScope } from '../../domain/user-access.domain';
import { Repository } from './repository';

export class UserAccessRepository extends Repository {
  async findAll(): Promise<UserAccessDomain[]> {
    const result = await this.db
      .with({ user: true, role: true, organization: true, project: true })
      .select()
      .from(UserAccessEntity)
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new UserAccessDomain(row));
  }

  async findByUserId(userId: string): Promise<UserAccessDomain[]> {
    const result = await this.db
      .with({ user: true, role: true, organization: true, project: true })
      .select()
      .from(UserAccessEntity)
      .where({ userId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new UserAccessDomain(row));
  }

  async findByUserIdAndScope(
    userId: string,
    scope: UserAccessScope,
    scopeId?: string,
  ): Promise<UserAccessDomain[]> {
    const access = await this.findByUserId(userId);
    return access.filter((entry) => {
      if (entry.scope !== scope) return false;
      if (scope === 'organization') return entry.organizationId === scopeId;
      if (scope === 'project') return entry.projectId === scopeId;
      return true;
    });
  }

  async findByScope(scope: UserAccessScope, scopeId?: string): Promise<UserAccessDomain[]> {
    const access = await this.findAll();
    return access.filter((entry) => {
      if (entry.scope !== scope) return false;
      if (scope === 'organization') return entry.organizationId === scopeId;
      if (scope === 'project') return entry.projectId === scopeId;
      return true;
    });
  }

  async findOne(input: {
    userId: string;
    scope: UserAccessScope;
    organizationId?: string | null;
    projectId?: string | null;
  }): Promise<UserAccessDomain | null> {
    const access = await this.findByUserId(input.userId);
    return (
      access.find((entry) => {
        if (entry.scope !== input.scope) return false;
        if (input.scope === 'organization') return entry.organizationId === input.organizationId;
        if (input.scope === 'project') return entry.projectId === input.projectId;
        return true;
      }) ?? null
    );
  }

  async create(input: {
    id: string;
    userId: string;
    roleId: string;
    scope: UserAccessScope;
    organizationId?: string | null;
    projectId?: string | null;
  }): Promise<void> {
    await this.db.insert(UserAccessEntity).values({
      id: input.id,
      userId: input.userId,
      roleId: input.roleId,
      scope: input.scope,
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(UserAccessEntity).where({ id });
  }
}
