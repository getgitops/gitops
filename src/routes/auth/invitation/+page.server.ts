import { fail, redirect } from '@sveltejs/kit';
import { authService, invitationService } from '$modules/auth';

const SESSION_COOKIE = 'pos_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function load({ url }) {
  const token = url.searchParams.get('token') ?? '';

  try {
    const invitation = await invitationService.findByToken(token);
    return { token, username: invitation.username, email: invitation.email, error: null };
  } catch (error: unknown) {
    return {
      token,
      username: null,
      email: null,
      error: error instanceof Error ? error.message : 'This invitation is no longer valid',
    };
  }
}

export const actions = {
  async accept({ request, cookies }) {
    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (password !== confirmPassword) {
      return fail(400, { error: 'Passwords do not match.' });
    }

    let userId: string;
    try {
      const invitation = await invitationService.acceptInvitation(
        String(form.get('token') ?? ''),
        password,
      );
      userId = invitation.userId;
    } catch (error: unknown) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to accept the invitation.',
      });
    }

    cookies.set(SESSION_COOKIE, authService.createSessionToken(userId), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
    });

    throw redirect(303, '/');
  },
};
