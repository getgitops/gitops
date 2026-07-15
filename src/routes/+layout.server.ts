import { getConfig, getStorageBackends } from '$lib/config';

export async function load({ cookies, locals }) {
  const config = await getConfig();
  const backends = getStorageBackends();

  let activeBackendId = cookies.get('active_backend');
  let activeBackend = backends.find((backend) => backend.id === activeBackendId);

  if (!activeBackend && backends.length > 0) {
    activeBackend = backends[0];
    activeBackendId = activeBackend.id;
  }

  return {
    isConfigured: !!config && backends.length > 0,
    backends,
    activeBackendId,
    user: locals.user,
  };
}
