import { error } from '@sveltejs/kit';
import { organizationService } from '../../../../modules/organization';

export async function load({ params }) {
  try {
    const organization = await organizationService.findBySlug(params.org);
    return { organization };
  } catch {
    throw error(404, 'Organization not found');
  }
}
