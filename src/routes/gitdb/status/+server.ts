import { json } from '@sveltejs/kit';
import { gitDbSyncService } from '$lib/server/gitdb/sync';

export function GET() {
  return json(gitDbSyncService.getStatus(), {
    headers: { 'cache-control': 'no-store' },
  });
}
