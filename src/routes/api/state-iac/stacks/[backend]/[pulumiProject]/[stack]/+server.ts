import { json } from '@sveltejs/kit';
import { toResponse } from '#lib/server/alerts/http';
import { getStack, parseInclude, resolveStackScope } from '#lib/server/state-iac/stacks';

// GET /api/state-iac/stacks/<backendId>/<pulumiProject>/<stack>?projectId=…|organizationId=…
// [&include=resources,outputs][&refresh=1]. `~` is the project of a legacy stack without
// resources. Secret values come back as { "$iac": "secret" }; a stack not assigned to the project
// answers 404. Resources and outputs need `project:stateiac:states:read` in a project
export async function GET({ params, url, locals }) {
  const scope = await resolveStackScope({
    projectId: url.searchParams.get('projectId'),
    organizationId: url.searchParams.get('organizationId'),
  });
  if (!scope.ok) return json({ error: scope.error }, { status: scope.status });
  return toResponse(
    await getStack(
      locals,
      scope.data,
      { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
      parseInclude(url.searchParams.get('include')),
      { refresh: url.searchParams.get('refresh') === '1' },
    ),
  );
}
