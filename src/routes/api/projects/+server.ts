import { json } from '@sveltejs/kit';
import { db } from '$lib/db';

export async function GET() {
  try {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return json({ projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const { name } = await request.json();
    if (!name || name.trim() === '') {
      throw new Error('Project name is required');
    }

    const id = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    db.prepare(
      'INSERT INTO projects (id, name) VALUES (@id, @name) ON CONFLICT(id) DO NOTHING',
    ).run({
      id,
      name: name.trim(),
    });

    return json({ success: true, project: { id, name: name.trim() } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
