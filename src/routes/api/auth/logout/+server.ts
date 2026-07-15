import { redirect } from '@sveltejs/kit';

export async function POST({ cookies }) {
  cookies.delete('pos_session', { path: '/' });
  throw redirect(302, '/login?loggedOut=true');
}

export async function GET({ cookies }) {
  cookies.delete('pos_session', { path: '/' });
  throw redirect(302, '/login?loggedOut=true');
}
