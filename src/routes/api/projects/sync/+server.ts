import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { getStorageBackend, getStorageBackends } from '$lib/config';
import { listPulumiStates } from '$lib/storage';

export async function POST({ cookies }) {
  try {
    const backends = getStorageBackends();
    if (!backends.length) throw new Error('No storage configured');

    const activeId = cookies.get('active_backend') || backends[0].id;
    const config = getStorageBackend(activeId) || getStorageBackend(backends[0].id);

    if (!config) throw new Error('No storage configured');

    const { states: files } = await listPulumiStates(config);
    const projects = new Set<string>();

    for (const file of files) {
      let id = file;
      if (id.startsWith('.pulumi/stacks/')) id = id.replace('.pulumi/stacks/', '');
      if (id.endsWith('.json')) id = id.slice(0, -5);

      const parts = id.split('/');
      projects.add(parts.length > 1 ? parts[0] : 'default');
    }

    const statement = db.prepare(
      'INSERT INTO projects (id, name) VALUES (@id, @name) ON CONFLICT(id) DO NOTHING',
    );
    db.transaction(() => {
      for (const project of projects) {
        statement.run({ id: project, name: project });
      }
    })();

    return json({ success: true, count: projects.size });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
