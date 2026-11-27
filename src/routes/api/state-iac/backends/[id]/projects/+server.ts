import { toResponse } from '#lib/server/alerts/http';
import { listBackendProjects } from '#lib/server/state-iac/backends';

// GET /api/state-iac/backends/<id>/projects: Pulumi projects and stacks found in the bucket, with
// the GitOps project each one is assigned to
export async function GET({ params, locals }) {
  return toResponse(await listBackendProjects(locals, params.id));
}
