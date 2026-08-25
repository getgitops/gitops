import { fail, redirect } from '@sveltejs/kit';
import { authService } from '$modules/auth';

const SESSION_COOKIE = 'pos_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function load({ cookies }) {
  const currentUser = await authService.resolveAuthenticatedUser(cookies.get(SESSION_COOKIE));
  if (currentUser) {
    throw redirect(303, '/');
  }
  return {};
}

export const actions = {
  async login({ request, cookies }) {
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!username || !password) {
      return fail(400, { username, error: 'Username and password are required.' });
    }

    const user = await authService.authenticate(username, password);
    if (!user) {
      // same message for unknown user and wrong password, to avoid leaking valid usernames
      return fail(401, { username, error: 'Invalid username or password.' });
    }

    cookies.set(SESSION_COOKIE, authService.createSessionToken(user.id), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
    });

    throw redirect(303, '/');
  },
};
