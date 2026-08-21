import { json } from '@sveltejs/kit';
import { organizationService } from '../../../../modules/organization';
import { isAdmin } from '../../../../modules/auth';

export async function GET({ params, locals }) {
  if (!isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const organization = await organizationService.getOrganization(params.id);
    return json({ organization });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 404 });
  }
}

export async function PATCH({ request, params, locals }) {
  if (!isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
    };

    const organization = await organizationService.updateOrganization(params.id, {
      name: data.name,
      slug: data.slug,
      description: data.description,
    });

    return json({ success: true, organization });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  if (!isAdmin(locals.user)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await organizationService.deleteOrganization(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
