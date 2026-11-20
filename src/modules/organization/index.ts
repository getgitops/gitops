import { OrganizationService } from './application/organization.service';
import { OrganizationRepository } from './infrastructure/repositories/organization.repository';
import { eventBus } from '#lib/server/events';

const organizationRepository = new OrganizationRepository();

export const organizationService = new OrganizationService(organizationRepository, eventBus);
export type { Organization } from './application/organization.service';
export { OrganizationDomain } from './domain/organization.domain';
