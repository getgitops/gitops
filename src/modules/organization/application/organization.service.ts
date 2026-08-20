export type Organization = { id: string; name: string; slug: string };

export class OrganizationService {
  // stub: no persistence yet, always resolves to the single default organization
  async findBySlug(_slug: string): Promise<Organization> {
    return { id: 'gitops', name: 'GitOps', slug: 'gitops' };
  }
}
