import { json } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';

export async function GET() {
  try {
    const projects = projectService.listProjects();
    return json({ projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const { name } = await request.json();
    const project = projectService.createProject(String(name || ''));
    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
