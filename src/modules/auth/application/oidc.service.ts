import type { OidcProvider } from '../domain/oidc';
import type { OidcProviderDomain } from '../domain/oidc.domain';
import type { OidcRepository } from '../infrastructure/repositories/oidc.repository';

type OidcProviderJson = ReturnType<OidcProviderDomain['toJson']>;

export class OidcService {
  constructor(private readonly repository: OidcRepository) {}

  async list(): Promise<OidcProviderJson[]> {
    const domains = await this.repository.findAll();
    return domains.map((d) => d.toJson());
  }

  async create(provider: OidcProvider): Promise<OidcProviderJson> {
    const domain = await this.repository.create(provider);
    return domain.toJson();
  }

  async update(provider: OidcProvider): Promise<OidcProviderJson> {
    const domain = await this.repository.update(provider);
    return domain.toJson();
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
