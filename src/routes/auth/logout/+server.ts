import { redirect } from '@sveltejs/kit';

const SESSION_COOKIE = 'pos_session';

function signOut(cookies: { delete: (name: string, options: { path: string }) => void }): never {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  throw redirect(303, '/auth/login?loggedOut=true');
}

export function GET({ cookies }) {
  signOut(cookies);
}

export function POST({ cookies }) {
  signOut(cookies);
}
