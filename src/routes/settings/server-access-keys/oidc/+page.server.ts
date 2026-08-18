import { fail, redirect } from '@sveltejs/kit';
import { oidcService } from '../../../../modules/auth';

export async function load({ locals }) {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const providers = await oidcService.list();

  return { providers };
}

export const actions = {
  save: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const id = String(formData.get('id') || '').trim() || crypto.randomUUID();
    const type = String(formData.get('type') || '').trim();
    const enabled = formData.get('enabled') === 'true' || formData.get('enabled') === 'on';
    const audience = String(formData.get('audience') || '').trim();

    if (!type || !['github', 'bitbucket', 'custom'].includes(type)) {
      return fail(400, { message: 'Invalid provider type.' });
    }

    if (!audience) {
      return fail(400, { message: 'Audience is required.' });
    }

    if (type === 'github') {
      const raw = String(formData.get('allowed_repos') || '');
      const allowed_repos = raw
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      await oidcService.save({ id, type: 'github', enabled, audience, allowed_repos });
    } else if (type === 'bitbucket') {
      const rawWs = String(formData.get('allowed_workspace_uuids') || '');
      const rawRepo = String(formData.get('allowed_repository_uuids') || '');
      const allowed_workspace_uuids = rawWs
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const allowed_repository_uuids = rawRepo
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      await oidcService.save({
        id,
        type: 'bitbucket',
        enabled,
        audience,
        allowed_workspace_uuids,
        allowed_repository_uuids,
      });
    } else if (type === 'custom') {
      const issuer = String(formData.get('issuer') || '').trim();
      const jwks_uri = String(formData.get('jwks_uri') || '').trim();

      if (!issuer || !jwks_uri) {
        return fail(400, { message: 'Issuer URL and JWKS Endpoint are required for custom providers.' });
      }

      const required_claims: Record<string, string> = {};
      const claimKeys = formData.getAll('claim_key');
      const claimValues = formData.getAll('claim_value');
      for (let i = 0; i < claimKeys.length; i++) {
        const k = String(claimKeys[i]).trim();
        const v = String(claimValues[i]).trim();
        if (k) required_claims[k] = v;
      }

      await oidcService.save({ id, type: 'custom', enabled, audience, issuer, jwks_uri, required_claims });
    }

    return { message: 'OIDC provider saved.' };
  },

  delete: async ({ request, locals }) => {
    if (!locals.user) throw redirect(302, '/login');

    const formData = await request.formData();
    const id = String(formData.get('id') || '').trim();

    if (!id) {
      return fail(400, { message: 'Provider ID is required.' });
    }

    await oidcService.delete(id);
    return { message: 'OIDC provider deleted.' };
  },
};
