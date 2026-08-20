import { fail, redirect } from '@sveltejs/kit';
import { apiKeysService, profileService } from '../../modules/auth';

function expiresAtFromDays(expiresInDays: string | null): string | null {
  if (!expiresInDays) {
    return null;
  }

  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function load({ locals, cookies }) {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const user = await profileService.getAuthenticatedUserProfile(locals.user.id);

  if (!user) {
    throw redirect(302, '/login');
  }


  const apiKeys = await apiKeysService.listActiveApiKeys(user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    gcpConnected: false,
    apiKeys,
  };
}

export const actions = {
  updateProfile: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const email = String(formData.get('email') || '').trim() || null;

    await profileService.updateEmail(locals.user.id, email);

    return { section: 'profile', message: 'Profile updated.' };
  },

  updatePassword: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return fail(400, { section: 'password', message: 'Complete all password fields.' });
    }

    if (newPassword.length < 8) {
      return fail(400, { section: 'password', message: 'Password must be at least 8 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return fail(400, { section: 'password', message: 'Passwords do not match.' });
    }

    if (!(await profileService.changePassword(locals.user.id, currentPassword, newPassword))) {
      return fail(400, { section: 'password', message: 'Current password is incorrect.' });
    }

    return { section: 'password', message: 'Password updated.' };
  },

  createApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();
    const expiresInDays = String(formData.get('expiresInDays') || '').trim();

    if (!name) {
      return fail(400, { section: 'apiKeys', message: 'Key name is required.' });
    }

    const expiresAt = expiresAtFromDays(expiresInDays || null);

    const { token } = await apiKeysService.createApiKey(locals.user.id, name, expiresAt);

    return { section: 'apiKeys', message: 'API key created.', createdKey: token };
  },

  regenerateApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const keyId = String(formData.get('keyId') || '');

    if (!keyId) {
      return fail(400, { section: 'apiKeys', message: 'Key id is required.' });
    }

    const { token } = await apiKeysService.regenerateApiKey(locals.user.id, keyId);

    return { section: 'apiKeys', message: 'API key regenerated.', createdKey: token };
  },

  revokeApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const keyId = String(formData.get('keyId') || '');

    await apiKeysService.revokeApiKey(locals.user.id, keyId);

    return { section: 'apiKeys', message: 'API key revoked.' };
  },
};