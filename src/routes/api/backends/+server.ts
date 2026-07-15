import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { db } from '$lib/db';
import { getStorageBackend, getStorageBackends } from '$lib/config';

export async function GET() {
  return json({ backends: getStorageBackends() });
}

export async function POST({ request }) {
  try {
    const data = await request.json();
    const id = data.id || crypto.randomUUID();

    let secretAccessKey = data.secretAccessKey;
    let gcpCredentials = data.gcpCredentials;

    if (data.id) {
      const existing = getStorageBackend(data.id);
      if (existing) {
        if (secretAccessKey === '***') secretAccessKey = existing.secretAccessKey;
        if (gcpCredentials === '***') gcpCredentials = existing.gcpCredentials;
      }
    }

    db.prepare(
      `
      INSERT INTO storage_backends (
        id, name, provider, bucket, region, access_key_id, secret_access_key, endpoint, gcp_project_id, gcp_credentials
      ) VALUES (
        @id, @name, @provider, @bucket, @region, @accessKeyId, @secretAccessKey, @endpoint, @gcpProjectId, @gcpCredentials
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider = excluded.provider,
        bucket = excluded.bucket,
        region = excluded.region,
        access_key_id = excluded.access_key_id,
        secret_access_key = excluded.secret_access_key,
        endpoint = excluded.endpoint,
        gcp_project_id = excluded.gcp_project_id,
        gcp_credentials = excluded.gcp_credentials
    `,
    ).run({
      id,
      name: data.name || 'Unnamed Backend',
      provider: data.provider,
      bucket: data.bucket,
      region: data.region || null,
      accessKeyId: data.accessKeyId || null,
      secretAccessKey: secretAccessKey || null,
      endpoint: data.endpoint || null,
      gcpProjectId: data.gcpProjectId || null,
      gcpCredentials: gcpCredentials || null,
    });

    return json({ success: true, id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
