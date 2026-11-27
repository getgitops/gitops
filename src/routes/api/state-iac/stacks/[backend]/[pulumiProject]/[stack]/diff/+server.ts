import { json } from '@sveltejs/kit';
import { toResponse } from '#lib/server/alerts/http';
import { getStackDiff, resolveStackScope } from '#lib/server/state-iac/stacks';

// GET …/stacks/<backend>/<pulumiProject>/<stack>/diff?projectId=…|organizationId=…[&from=&to=]:
// `from`/`to` are source ids (`current`, `history:<ns>`, `backup:<ns>`, `retained:<ns>`,
// `previous`, `version:<id>`); by default the last update against the one before. Needs
// `project:stateiac:states:read`. Secrets are compared without being revealed
export async function GET({ params, url, locals }) {
  const scope = await resolveStackScope({
    projectId: url.searchParams.get('projectId'),
    organizationId: url.searchParams.get('organizationId'),
  });
  if (!scope.ok) return json({ error: scope.error }, { status: scope.status });
  return toResponse(
    await getStackDiff(
      locals,
      scope.data,
      { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
      { from: url.searchParams.get('from'), to: url.searchParams.get('to') },
    ),
  );
}
