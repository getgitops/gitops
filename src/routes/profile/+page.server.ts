import { fail, redirect } from '@sveltejs/kit';
import { profileService } from '../../modules/auth';
import { storageBackendService } from '../../modules/config';

export async function load({ locals, cookies }) {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const user = await profileService.getAuthenticatedUserProfile(locals.user.id);

  if (!user) {
    throw redirect(302, '/login');
  }

  const backends = storageBackendService.list();
  const activeBackendId = cookies.get('active_backend') || backends[0]?.id || null;
  const activeBackend = backends.find((backend) => backend.id === activeBackendId) || null;
  const gcpConnected = activeBackend?.provider === 'gcs';

  // const apiKeys = await profileService.listActiveApiKeys(user.id);
  const apiKeys = []

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    gcpConnected,
    apiKeys: apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    })),
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

    if (!name) {
      return fail(400, { section: 'apiKeys', message: 'Key name is required.' });
    }

    const { token } = await profileService.createApiKey(locals.user.id, name);

    return { section: 'apiKeys', message: 'API key created.', createdKey: token };
  },

  revokeApiKey: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const keyId = String(formData.get('keyId') || '');

    await profileService.revokeApiKey(locals.user.id, keyId);

    return { section: 'apiKeys', message: 'API key revoked.' };
  },
};