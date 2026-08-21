import { OrganizationService } from './application/organization.service';
import { OrganizationRepository } from './infrastructure/repositories/organization.repository';

const organizationRepository = new OrganizationRepository();

export const organizationService = new OrganizationService(organizationRepository);
export type { Organization } from './application/organization.service';

// Bootstrap the default org once at startup.
const organizationBootstrap = organizationService.bootstrapDefaults();

export async function ensureOrganizationReady(): Promise<void> {
  await organizationBootstrap;
}
