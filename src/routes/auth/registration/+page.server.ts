import { fail, redirect } from '@sveltejs/kit';
import { authService } from '$modules/auth';
import { clusterSettingsService } from '$modules/config';

const SESSION_COOKIE = 'pos_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function load({ cookies }) {
  const currentUser = await authService.resolveAuthenticatedUser(cookies.get(SESSION_COOKIE));
  if (currentUser) {
    throw redirect(303, '/');
  }

  const registrationEnabled = await clusterSettingsService.isRegistrationEnabled();
  return { registrationEnabled };
}

export const actions = {
  async register({ request, cookies }) {
    // re-checked here so the toggle can't be bypassed by posting the form directly
    if (!(await clusterSettingsService.isRegistrationEnabled())) {
      return fail(403, { username: '', email: '', error: 'Registration is disabled.' });
    }

    const form = await request.formData();
    const username = String(form.get('username') ?? '');
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const passwordConfirmation = String(form.get('passwordConfirmation') ?? '');

    if (password !== passwordConfirmation) {
      return fail(400, { username, email, error: 'Passwords do not match.' });
    }

    let userId: string;
    try {
      const user = await authService.register({ username, email, password });
      userId = user.id;
    } catch (error: unknown) {
      return fail(400, {
        username,
        email,
        error: error instanceof Error ? error.message : 'Failed to create the account.',
      });
    }

    cookies.set(SESSION_COOKIE, authService.createSessionToken(userId), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
    });

    throw redirect(303, '/org');
  },
};
