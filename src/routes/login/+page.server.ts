import { redirect } from '@sveltejs/kit';

// ruta antigua: el acceso vive en /auth/login
export function load() {
  throw redirect(308, '/auth/login');
}
