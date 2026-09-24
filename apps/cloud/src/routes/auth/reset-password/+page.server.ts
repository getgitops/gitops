import { fail, redirect } from '@sveltejs/kit';
import { passwordResetService } from '$modules/auth';

export function load({ url }) {
  const token = url.searchParams.get('token') ?? '';
  return { token };
}

export const actions = {
  async reset({ request }) {
    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const password = String(form.get('password') ?? '');
    const passwordConfirmation = String(form.get('passwordConfirmation') ?? '');

    if (password !== passwordConfirmation) {
      return fail(400, { token, error: 'Passwords do not match.' });
    }

    try {
      await passwordResetService.resetPassword(token, password);
    } catch (error: unknown) {
      return fail(400, {
        token,
        error: error instanceof Error ? error.message : 'Failed to reset the password.',
      });
    }

    throw redirect(303, '/auth/login?passwordReset=1');
  },
};
