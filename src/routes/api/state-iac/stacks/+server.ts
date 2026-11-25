import { json } from '@sveltejs/kit';
import { toResponse } from '#lib/server/alerts/http';
import { listStacks, resolveStackScope } from '#lib/server/state-iac/stacks';

// GET /api/state-iac/stacks?projectId=…|organizationId=…[&refresh=1]: from a project, only the
// stacks assigned to it (`project:stateiac:stacks:read`); from the organization, all of them
// (`organization:stateiac:stacks:read`). Backends that can't be read come back with their `error`
export async function GET({ url, locals }) {
  const scope = await resolveStackScope({
    projectId: url.searchParams.get('projectId'),
    organizationId: url.searchParams.get('organizationId'),
  });
  if (!scope.ok) return json({ error: scope.error }, { status: scope.status });
  return toResponse(
    await listStacks(locals, scope.data, { refresh: url.searchParams.get('refresh') === '1' }),
  );
}
