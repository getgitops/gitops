import { json } from '@sveltejs/kit';
import { gitDbSyncService } from '$lib/server/gitdb/sync';

export async function GET() {
  return json(await gitDbSyncService.getStatus(), {
    headers: { 'cache-control': 'no-store' },
  });
}
