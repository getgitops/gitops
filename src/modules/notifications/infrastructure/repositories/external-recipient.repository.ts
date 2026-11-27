import { ExternalRecipientEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import {
  ExternalRecipientDomain,
  type ExternalRecipientRow,
} from '../../domain/external-recipient.domain';

export type ExternalRecipientChanges = Partial<
  Omit<ExternalRecipientRow, 'id' | 'organizationId' | 'email' | 'createdByUserId' | 'createdAt'>
>;

/** Persistence port; `InMemoryExternalRecipientRepository` implements it in tests. */
export interface ExternalRecipientRepositoryPort {
  findById(id: string): Promise<ExternalRecipientDomain | null>;
  findByEmail(organizationId: string, email: string): Promise<ExternalRecipientDomain | null>;
  findByVerificationTokenHash(hash: string): Promise<ExternalRecipientDomain | null>;
  listByOrganization(organizationId: string): Promise<ExternalRecipientDomain[]>;
  create(row: ExternalRecipientRow): Promise<void>;
  update(id: string, changes: ExternalRecipientChanges): Promise<void>;
  delete(id: string): Promise<void>;
}

export class ExternalRecipientRepository
  extends Repository
  implements ExternalRecipientRepositoryPort
{
  async findById(id: string) {
    const result = await this.db.select().from(ExternalRecipientEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new ExternalRecipientDomain(row) : null;
  }

  async findByEmail(organizationId: string, email: string) {
    const result = await this.db
      .select()
      .from(ExternalRecipientEntity)
      .where({ organizationId, email })
      .limit(1);
    const row = result.rows[0];
    return row ? new ExternalRecipientDomain(row) : null;
  }

  async findByVerificationTokenHash(hash: string) {
    const result = await this.db
      .select()
      .from(ExternalRecipientEntity)
      .where({ verificationTokenHash: hash })
      .limit(1);
    const row = result.rows[0];
    return row ? new ExternalRecipientDomain(row) : null;
  }

  async listByOrganization(organizationId: string) {
    const result = await this.db
      .select()
      .from(ExternalRecipientEntity)
      .where({ organizationId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new ExternalRecipientDomain(row));
  }

  async create(row: ExternalRecipientRow) {
    await this.db.insert(ExternalRecipientEntity).values({ ...row });
  }

  async update(id: string, changes: ExternalRecipientChanges) {
    await this.db
      .update(ExternalRecipientEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string) {
    await this.db.delete(ExternalRecipientEntity).where({ id });
  }
}
