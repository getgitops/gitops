import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../modules/config';

export async function GET() {
  return json({ backends: storageBackendService.list() });
}

export async function POST({ request }) {
  try {
    const data = await request.json();
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
