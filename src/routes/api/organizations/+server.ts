import { json } from '@sveltejs/kit';
import { organizationService } from '../../../modules/organization';
import { cancanService } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!cancanService.canAccessAdminArea(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const organizations = await organizationService.listOrganizations();
    return json({ organizations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!cancanService.canAccessAdminArea(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
    };

    const organization = await organizationService.createOrganization({
      name: String(data.name || ''),
      slug: data.slug ? String(data.slug) : undefined,
      description: data.description ? String(data.description) : undefined,
    });

    return json({ success: true, organization });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
