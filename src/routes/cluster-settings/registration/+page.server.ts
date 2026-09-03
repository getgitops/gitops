import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { clusterSettingsService } from '$modules/config';

export async function load() {
  const settings = await clusterSettingsService.getSettings();
  return { settings };
}

export const actions = {
  async updateRegistration({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    const form = await request.formData();
    const registrationEnabled = form.get('registrationEnabled') === 'on';

    try {
      const settings = await clusterSettingsService.setRegistrationEnabled(registrationEnabled);
      return { success: true, settings };
    } catch (error: unknown) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update registration settings.',
      });
    }
  },
};
