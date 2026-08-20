// import { configService, storageBackendService } from '../modules/config';

export async function load({ cookies, locals }) {
  // const config = configService.getConfig();
  // const backends = storageBackendService.list();

  // let activeBackendId = cookies.get('active_backend');
  // let activeBackend = backends.find((backend) => backend.id === activeBackendId);

  // if (!activeBackend && backends.length > 0) {
  //   activeBackend = backends[0];
  //   activeBackendId = activeBackend.id;
  // }

  return {
    // isConfigured: !!config && backends.length > 0,
    isConfigured: true,
    // backends,
    // activeBackendId,
    user: locals.user,
  };
}
