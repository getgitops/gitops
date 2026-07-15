import { getStorageBackend, getStorageBackends } from '$lib/config';
import { getPulumiState, listPulumiHistory } from '$lib/storage';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, cookies }) => {
  const backends = getStorageBackends();
  if (!backends.length) throw redirect(302, '/pulumi-state/backends');

  const activeId = cookies.get('active_backend') || backends[0].id;
  const config = getStorageBackend(activeId) || getStorageBackend(backends[0].id);

  if (!config) throw redirect(302, '/pulumi-state/backends');

  const cleanId = params.id;
  const checkpointKey = url.searchParams.get('checkpoint');

  let state = null;
  let finalKey = '';
  let history: Array<Record<string, unknown>> = [];

  if (checkpointKey) {
    try {
      state = await getPulumiState(config, checkpointKey);
      finalKey = checkpointKey;
    } catch (error: unknown) {
      console.error('Failed to load checkpoint state', error);
    }
  } else {
    const tryKeys = [`.pulumi/stacks/${cleanId}.json`, `${cleanId}.json`, cleanId];

    for (const key of tryKeys) {
      try {
        state = await getPulumiState(config, key);
        finalKey = key;
        break;
      } catch (error: unknown) {
        console.error('Failed to load stack state', error);
      }
    }
  }

  if (!state) {
    return {
      error: `Stack not found for ID '${cleanId}'.`,
      cleanId,
    };
  }

  try {
    history = await listPulumiHistory(config, cleanId);
  } catch (error) {
    console.error('Failed to load history', error);
  }

  return {
    state,
    key: finalKey,
    cleanId,
    history,
    isHistorical: !!checkpointKey,
  };
};
