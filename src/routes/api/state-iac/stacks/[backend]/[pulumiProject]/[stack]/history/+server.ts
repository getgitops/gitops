import { json } from '@sveltejs/kit';
import { toResponse } from '#lib/server/alerts/http';
import { getStackHistory, resolveStackScope } from '#lib/server/state-iac/stacks';

// GET …/stacks/<backend>/<pulumiProject>/<stack>/history?projectId=…|organizationId=…
// [&cursor=<nextCursor>][&limit=20]: updates newest first (`project:stateiac:history:read`).
// Config secrets come back masked; the environment is an allow-list (no emails nor paths)
export async function GET({ params, url, locals }) {
  const scope = await resolveStackScope({
    projectId: url.searchParams.get('projectId'),
    organizationId: url.searchParams.get('organizationId'),
  });
  if (!scope.ok) return json({ error: scope.error }, { status: scope.status });
  const limit = Number(url.searchParams.get('limit') ?? 20);
  return toResponse(
    await getStackHistory(
      locals,
      scope.data,
      { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
      { cursor: url.searchParams.get('cursor'), limit: Number.isFinite(limit) ? limit : 20 },
    ),
  );
}
