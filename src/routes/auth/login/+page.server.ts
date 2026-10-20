import { fail, redirect } from '@sveltejs/kit';
import { authService, ssoService } from '$modules/auth';
import { clusterSettingsService } from '$modules/config';
import { organizationService } from '$modules/organization';

const SESSION_COOKIE = 'pos_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const LAST_ORG_COOKIE = 'last_org';
const LAST_ORG_MAX_AGE = 60 * 60 * 24 * 365;

export async function load({ cookies, url }) {
  const currentUser = await authService.resolveAuthenticatedUser(cookies.get(SESSION_COOKIE));
  if (currentUser) {
    throw redirect(303, '/');
  }
  const registrationEnabled = await clusterSettingsService.isRegistrationEnabled();
  const requestedSlug = url.searchParams.get('org')?.trim() || null;
  const slug = requestedSlug ?? cookies.get(LAST_ORG_COOKIE) ?? null;
  let organization = slug ? await organizationService.tryFindBySlug(slug) : null;

  if (!organization) {
    const soleOrganizationId = await ssoService.findSoleGoogleOrganizationId();
    organization = soleOrganizationId
      ? await organizationService.getOrganization(soleOrganizationId).catch(() => null)
      : null;
  }

  if (organization && requestedSlug) {
    cookies.set(LAST_ORG_COOKIE, organization.slug, {
      path: '/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: LAST_ORG_MAX_AGE,
    });
  }

  const googleEnabled = organization ? await ssoService.isGoogleEnabled(organization.id) : false;

  return {
    registrationEnabled,
    sso: googleEnabled
      ? { organizationSlug: organization!.slug, organizationName: organization!.name, google: true }
      : null,
    ssoError: url.searchParams.get('ssoError'),
  };
}

export const actions = {
  async login({ request, cookies }) {
    const form = await request.formData();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { email, error: 'Email and password are required.' });
    }

    const user = await authService.authenticate(email, password);
    if (!user) {
      // same message for unknown email and wrong password, to avoid leaking valid emails
      return fail(401, { email, error: 'Invalid email or password.' });
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
