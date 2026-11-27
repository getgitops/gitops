import { error, fail } from '@sveltejs/kit';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import {
  backendInputFrom,
  canManageBackends,
  createBackend,
  deleteBackend,
  getBackend,
  listBackends,
  testBackend,
  updateBackend,
} from '#lib/server/state-iac/backends';

export async function load({ parent, locals }) {
  const { organization } = await parent();
  const listed = await listBackends(locals, organization.id);
  if (!listed.ok) throw error(listed.status, listed.error);

  const [canCreate, canUpdate, canDelete, canTest, projects] = await Promise.all([
    canManageBackends(locals, organization.id, 'create'),
    canManageBackends(locals, organization.id, 'update'),
    canManageBackends(locals, organization.id, 'delete'),
    canManageBackends(locals, organization.id, 'test'),
    projectService.listProjectsByOrganization(organization.id),
  ]);

  return {
    organizationId: organization.id as string,
    backends: listed.data.backends,
    // only what the assignment selector needs
    projects: projects
      .map((project: { id: string; name: string; slug?: string | null }) => ({
        id: project.id,
        name: project.name,
        slug: project.slug ?? '',
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
    canCreate,
    canUpdate,
    canDelete,
    canTest,
  };
}

async function organizationOf(slug: string) {
  const organization = await organizationService.tryFindBySlug(slug);
  if (!organization) throw error(404, 'Organization not found');
  return organization;
}

/** Form fields → backend input; empty credential fields keep the stored ones. */
function formInput(form: FormData) {
  const value = (key: string) => {
    const raw = form.get(key);
    return raw === null ? undefined : String(raw);
  };
  return backendInputFrom({
    name: value('name'),
    provider: value('provider'),
    bucket: value('bucket'),
    prefix: value('prefix') ?? '',
    region: value('region') ?? '',
    endpoint: value('endpoint') ?? '',
    forcePathStyle: form.get('forcePathStyle') === 'on' || form.get('forcePathStyle') === 'true',
    auth: value('auth'),
    serviceAccountJson: value('serviceAccountJson'),
    accessKeyId: value('accessKeyId'),
    secretAccessKey: value('secretAccessKey'),
    sessionToken: value('sessionToken'),
  });
}

/** What the form gets back on a failure: never the credentials, they are typed again. */
function draftOf(form: FormData) {
  const draft: Record<string, string> = {};
  for (const key of ['name', 'provider', 'bucket', 'prefix', 'region', 'endpoint', 'auth']) {
    draft[key] = String(form.get(key) ?? '');
  }
  return draft;
}

export const actions = {
  async createBackend({ request, locals, params }) {
    const organization = await organizationOf(params.org);
    const form = await request.formData();
    const result = await createBackend(locals, organization.id, formInput(form));
    if (!result.ok) {
      return fail(result.status, {
        backendForm: 'create',
        draft: draftOf(form),
        error: result.error,
        errors: result.errors ?? {},
      });
    }
    return { saved: result.data.id, created: true };
  },

  async updateBackend({ request, locals, params }) {
    await organizationOf(params.org);
    const form = await request.formData();
    const id = String(form.get('backendId') ?? '');
    const input = formInput(form);
    // the provider can't change and is not posted by the edit form
    delete input.provider;
    const result = await updateBackend(locals, id, input);
    if (!result.ok) {
      return fail(result.status, {
        backendForm: id,
        draft: draftOf(form),
        error: result.error,
        errors: result.errors ?? {},
      });
    }
    return { saved: id };
  },

  async toggleBackend({ request, locals, params }) {
    await organizationOf(params.org);
    const form = await request.formData();
    const id = String(form.get('backendId') ?? '');
    const result = await updateBackend(locals, id, { enabled: form.get('enabled') === 'true' });
    if (!result.ok) return fail(result.status, { backendForm: id, error: result.error });
    return { saved: id };
  },

  async deleteBackend({ request, locals, params }) {
    await organizationOf(params.org);
    const form = await request.formData();
    const id = String(form.get('backendId') ?? '');
    // deleting a backend asks to type its name: checked here too, not only in the browser
    const current = await getBackend(locals, id);
    if (!current.ok) return fail(current.status, { backendForm: id, error: current.error });
    if (String(form.get('confirmName') ?? '') !== current.data.name) {
      return fail(400, { backendForm: id, error: 'confirm_name' });
    }
    const result = await deleteBackend(locals, id);
    if (!result.ok) return fail(result.status, { backendForm: id, error: result.error });
    return { deleted: id };
  },

  async testBackend({ request, locals, params }) {
    await organizationOf(params.org);
    const form = await request.formData();
    const id = String(form.get('backendId') ?? '');
    const result = await testBackend(locals, id);
    if (!result.ok) return fail(result.status, { backendForm: id, error: result.error });
    return { test: { backendId: id, ...result.data } };
  },
};
