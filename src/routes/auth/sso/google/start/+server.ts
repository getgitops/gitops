import { redirect } from '@sveltejs/kit';
import { SsoError, ssoService } from '#modules/auth';

const FLOW_COOKIE = 'gitops_sso_flow';
const FLOW_MAX_AGE = 10 * 60;
const GOOGLE_AUTHORIZATION_ORIGIN = 'https://accounts.google.com';

export async function GET({ url, cookies, locals }) {
  let authorizationUrl: string;
  try {
    const started = ssoService.startGoogleSignIn({
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
    locals.logger.warn({ err: error, code }, '[sso] start failed');
    throw redirect(303, `/auth/login?${new URLSearchParams({ ssoError: code })}`);
  }

  // SvelteKit 3 refuses external redirects unless their origin is allow-listed
  throw redirect(303, authorizationUrl, { external: [GOOGLE_AUTHORIZATION_ORIGIN] });
}
