import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  throw redirect(307, `/org/${params.org}/cves/${params.cve}`);
}
