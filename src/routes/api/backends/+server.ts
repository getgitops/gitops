import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../modules/config';
import { cancanService } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!(await cancanService.canSessionUser(locals.user, 'stateiac:read', { scope: 'cluster' }))) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  return json({ backends: storageBackendService.list() });
}

export async function POST({ request, locals }) {
  try {
    const data = await request.json();

    if (
      !(await cancanService.canSessionUser(
        locals.user,
        data.id ? 'stateiac:update' : 'stateiac:create',
        { scope: 'cluster' },
      ))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = storageBackendService.upsert({
      id: data.id,
      name: data.name,
      provider: data.provider,
      bucket: data.bucket,
      region: data.region || null,
      accessKeyId: data.accessKeyId || null,
      secretAccessKey: data.secretAccessKey || null,
      endpoint: data.endpoint || null,
      gcpProjectId: data.gcpProjectId || null,
      gcpCredentials: data.gcpCredentials || null,
    });

    return json({ success: true, id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
