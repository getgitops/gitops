import { redirect } from '@sveltejs/kit';
import { authService, SsoError, ssoService } from '$modules/auth';

const SESSION_COOKIE = 'pos_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const FLOW_COOKIE = 'gitops_sso_flow';

export async function GET({ url, cookies, locals }) {
  const flowCookie = cookies.get(FLOW_COOKIE);
  const organizationSlug = ssoService.peekFlowOrganization(flowCookie);
  // the flow is single-use whatever the outcome
  cookies.delete(FLOW_COOKIE, { path: '/auth/sso' });

  const loginWithError = (code: string) => {
    const params = new URLSearchParams({ ssoError: code });
    if (organizationSlug) params.set('org', organizationSlug);
    return `/auth/login?${params}`;
  };

  // the user cancelled or Google refused the request before issuing a code
  if (url.searchParams.has('error')) {
    throw redirect(303, loginWithError('cancelled'));
  }

  let result: { userId: string; organizationSlug: string };
  try {
    result = await ssoService.completeGoogleSignIn({
      flowCookie,
      state: url.searchParams.get('state') ?? '',
      code: url.searchParams.get('code') ?? '',
      redirectUri: `${url.origin}/auth/sso/google/callback`,
    });
  } catch (error) {
    const code = error instanceof SsoError ? error.code : 'provider_error';
    locals.logger.warn(
      { err: error, organization: organizationSlug, code },
      '[sso] sign-in rejected',
    );
    throw redirect(303, loginWithError(code));
  }

  cookies.set(SESSION_COOKIE, authService.createSessionToken(result.userId), {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
  });

  throw redirect(303, `/org/${encodeURIComponent(result.organizationSlug)}`);
}
