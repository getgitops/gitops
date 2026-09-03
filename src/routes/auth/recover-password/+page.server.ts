import { fail, redirect } from '@sveltejs/kit';
import { authService, passwordResetService } from '$modules/auth';

const SESSION_COOKIE = 'pos_session';

export async function load({ cookies }) {
  const currentUser = await authService.resolveAuthenticatedUser(cookies.get(SESSION_COOKIE));
  if (currentUser) {
    throw redirect(303, '/');
  }
  return {};
}

export const actions = {
  async recover({ request, url }) {
    const form = await request.formData();
    const email = String(form.get('email') ?? '');

    try {
      await passwordResetService.requestReset(email, `${url.origin}/auth/reset-password`);
    } catch (error: unknown) {
      return fail(400, {
        email,
        error: error instanceof Error ? error.message : 'Failed to send the reset link.',
      });
    }

    // always the same success response, whether or not the email is registered
    return { success: true };
  },
};
