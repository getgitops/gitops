import { error } from '@sveltejs/kit';
import { storageBackendService } from '../../modules/config';
import { projectService } from '../../modules/projects';
import { storageService } from '../../modules/storage';
import { can } from '../../modules/auth';

export async function load({ cookies, locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    throw error(403, 'Forbidden');
  }

  const backends = storageBackendService.list();

  if (!backends.length) {
    return {
      hasBackends: false,
    };
  }

  const requestedActiveId = cookies.get('active_backend') || backends[0].id;
  const activeBackend =
    storageBackendService.getById(requestedActiveId) || storageBackendService.getById(backends[0].id) || backends[0];
  const config = activeBackend;

  if (!config) {
    return {
      hasBackends: false,
    };
  }

  const dbProjects = projectService.listProjects();

  try {
    const { states: files, locks } = await storageService.listPulumiStates(config);
    const stateSummaries: Record<
      string,
      { version?: string; resourceCount: number; error?: boolean }
    > = {};

    const fetchPromises = files.map(async (fileKey) => {
      try {
        const state = await storageService.getPulumiState(config, fileKey);
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