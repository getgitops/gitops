import type { Cookies } from '@sveltejs/kit';

/** Where to land after signing in, for links that need a session (`/gitops login`). */
export const RETURN_TO_COOKIE = 'gitops_return_to';
const RETURN_TO_TTL_SECONDS = 10 * 60;
/** Only these pages ask to come back after the login; everything else lands on `/` as always. */
const RETURNABLE_PATHS = ['/notifications/slack/link'];

/** A same-origin path of `RETURNABLE_PATHS` (with its query), or `null`. */
export function safeReturnPath(value: string | undefined | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, 'http://gitops.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'http://gitops.invalid' || !RETURNABLE_PATHS.includes(url.pathname)) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

/**
 * `Set-Cookie` value that remembers `path`, or `null` when it is not returnable. A header, not
 * `cookies.set()`: the hook returns its own redirect, and SvelteKit only adds the cookies of
 * `cookies.set()` to responses that went through `resolve()`.
 */
export function returnToCookie(cookies: Cookies, path: string): string | null {
  const safe = safeReturnPath(path);
  if (!safe) return null;
  return cookies.serialize(RETURN_TO_COOKIE, safe, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: RETURN_TO_TTL_SECONDS,
  });
}

/** The remembered page (once), or `fallback`. */
export function consumeReturnTo(cookies: Cookies, fallback = '/'): string {
  const value = cookies.get(RETURN_TO_COOKIE);
  if (value === undefined) return fallback;
  cookies.delete(RETURN_TO_COOKIE, { path: '/' });
  return safeReturnPath(value) ?? fallback;
}
