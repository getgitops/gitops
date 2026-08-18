import type { OidcProvider } from '../domain/oidc';
import type { OidcRepository } from '../infrastructure/repositories/oidc.repository';

export class OidcService {
  constructor(private readonly repository: OidcRepository) {}

  async list(): Promise<OidcProvider[]> {
    return this.repository.findAll();
  }

  async save(provider: OidcProvider): Promise<void> {
    await this.repository.save(provider);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
