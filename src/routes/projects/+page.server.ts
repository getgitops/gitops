import { db } from '$lib/db';
import { getStorageBackend, getStorageBackends } from '$lib/config';
import { listPulumiStates, getPulumiState } from '$lib/storage';
import { redirect } from '@sveltejs/kit';

export async function load({ cookies }) {
  const backends = getStorageBackends();
  if (!backends.length) {
    throw redirect(302, '/settings/storage');
  }

  const activeId = cookies.get('active_backend') || backends[0].id;
  const config = getStorageBackend(activeId) || getStorageBackend(backends[0].id);

  if (!config) {
    throw redirect(302, '/settings/storage');
  }

  const dbProjects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Array<{
    id: string;
    name: string;
  }>;

  try {
    const { states: files, locks } = await listPulumiStates(config);
    const stateSummaries: Record<
      string,
      { version?: string; resourceCount: number; error?: boolean }
    > = {};

    const fetchPromises = files.map(async (fileKey) => {
      try {
        const state = await getPulumiState(config, fileKey);
        stateSummaries[fileKey] = {
          version: state.version,
          resourceCount: state.checkpoint?.latest?.resources?.length || 0,
        };
      } catch {
        stateSummaries[fileKey] = { resourceCount: 0, error: true };
      }
    });

    await Promise.allSettled(fetchPromises);

    return {
      files,
      locks,
      stateSummaries,
      dbProjects,
      bucket: config.bucket,
      provider: config.provider,
      region: config.region,
    };
  } catch (error: unknown) {
    return {
      files: [],
      locks: [],
      stateSummaries: {},
      dbProjects,
      bucket: config.bucket,
      provider: config.provider,
      region: config.region,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
