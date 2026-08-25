import { OrganizationService } from './application/organization.service';
import { OrganizationRepository } from './infrastructure/repositories/organization.repository';

const organizationRepository = new OrganizationRepository();

export const organizationService = new OrganizationService(organizationRepository);
export type { Organization } from './application/organization.service';
export { OrganizationDomain } from './domain/organization.domain';

// Bootstrap once, on first use, since it requires a configured GitDB repository.
let organizationBootstrap: Promise<void> | null = null;

export async function ensureOrganizationReady(): Promise<void> {
  if (!organizationBootstrap) {
    organizationBootstrap = organizationService.bootstrapDefaults().catch((error) => {
      organizationBootstrap = null;
      throw error;
    });
  }
  await organizationBootstrap;
}
