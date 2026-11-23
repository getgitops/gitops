import { error, redirect } from '@sveltejs/kit';

/** `/settings` opens the first tab the user may read (flags from the root layout) */
export async function load({ params, parent }) {
  const data = await parent();
  const base = `/org/${params.org}/projects/${params.slug}/settings`;
  const tabs: [boolean | undefined, string][] = [
    [data.canReadProjectInfo, 'global'],
    [data.canReadProjectUsers, 'access-control'],
    [data.canReadProjectRoles, 'roles-permissions'],
    [data.canReadProjectAlerts, 'alerts'],
    [data.canReadProjectServerKeys, 'server-access-keys'],
    [data.canReadProjectAudit, 'audit'],
  ];
  const first = tabs.find(([allowed]) => allowed)?.[1];
  if (!first) throw error(403, 'Forbidden');
  throw redirect(302, `${base}/${first}`);
}
