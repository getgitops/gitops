import { db } from '$lib/db';
import { getStorageBackend, getStorageBackends } from '$lib/config';
import { listPulumiStates, getPulumiState } from '$lib/storage';

export async function load({ cookies }) {
  const backends = getStorageBackends();

  if (!backends.length) {
    return {
      hasBackends: false,
    };
  }

  const requestedActiveId = cookies.get('active_backend') || backends[0].id;
  const activeBackend =
    getStorageBackend(requestedActiveId) || getStorageBackend(backends[0].id) || backends[0];
  const config = activeBackend;

  if (!config) {
    return {
      hasBackends: false,
    };
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
      hasBackends: true,
      files,
      locks,
      stateSummaries,
      dbProjects,
      backends: backends.map((backend) => ({ id: backend.id, name: backend.name })),
      activeBackendId: activeBackend.id,
      bucket: config.bucket,
      provider: config.provider,
      region: config.region,
    };
  } catch (error: unknown) {
    return {
      hasBackends: true,
      files: [],
      locks: [],
      stateSummaries: {},
      dbProjects,
      backends: backends.map((backend) => ({ id: backend.id, name: backend.name })),
      activeBackendId: activeBackend.id,
      bucket: config.bucket,
      provider: config.provider,
      region: config.region,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}