import { readJson, toResponse } from '#lib/server/alerts/http';
import { removeBinding, setBinding } from '#lib/server/state-iac/backends';

// PUT /api/state-iac/backends/<id>/projects/<pulumiProject> { projectId, stacks?: string[] }:
// assigns the Pulumi project (all its stacks when `stacks` is empty) to a project of the same
// organization, replacing any previous assignment
export async function PUT({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(
    await setBinding(locals, params.id, params.pulumiProject, {
      projectId: body.projectId,
      stacks: body.stacks,
    }),
  );
}

// DELETE /api/state-iac/backends/<id>/projects/<pulumiProject>: leaves it unassigned
export async function DELETE({ params, locals }) {
  return toResponse(await removeBinding(locals, params.id, params.pulumiProject));
}
