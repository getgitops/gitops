import { redirect } from '@sveltejs/kit';
import { SsoError, ssoService } from '$modules/auth';
import { organizationService } from '$modules/organization';

const FLOW_COOKIE = 'gitops_sso_flow';
const FLOW_MAX_AGE = 10 * 60;

export async function GET({ url, cookies, locals }) {
  const slug = url.searchParams.get('org')?.trim() ?? '';
  const organization = slug ? await organizationService.tryFindBySlug(slug) : null;
  if (!organization) {
    throw redirect(303, '/auth/login');
  }

  let authorizationUrl: string;
  try {
    const started = await ssoService.startGoogleSignIn({
      organization: { id: organization.id, slug: organization.slug },
      redirectUri: `${url.origin}/auth/sso/google/callback`,
    });
    authorizationUrl = started.authorizationUrl;

    // sameSite lax: Google's redirect back is a top-level GET navigation, so the cookie travels
    cookies.set(FLOW_COOKIE, started.flowCookie, {
      path: '/auth/sso',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: FLOW_MAX_AGE,
    });
  } catch (error) {
    const code = error instanceof SsoError ? error.code : 'provider_error';
    locals.logger.warn({ err: error, organization: organization.slug }, '[sso] start failed');
    throw redirect(
      303,
      `/auth/login?org=${encodeURIComponent(organization.slug)}&ssoError=${code}`,
    );
  }

  throw redirect(303, authorizationUrl);
}
