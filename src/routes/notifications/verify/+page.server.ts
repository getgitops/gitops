import { fail } from '@sveltejs/kit';
import { LINK_PAGE_HEADERS, inspectLink, useLink } from '#lib/server/notifications/links';

export async function load({ url, setHeaders }) {
  setHeaders(LINK_PAGE_HEADERS);
  const token = url.searchParams.get('token') ?? '';
  return { token, link: await inspectLink('verify', token) };
}

export const actions = {
  async default({ request }) {
    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const link = await useLink('verify', token);
    if (link.state !== 'done') return fail(400, { link });
    return { link };
  },
};
