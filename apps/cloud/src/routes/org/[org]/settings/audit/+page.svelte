<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';
  import { _ } from '$lib/i18n';

  type Pagination = { page: number; perPage: number; total: number; totalPages: number };

  export let data: { events: AuditEvent[]; pagination: Pagination; commitBaseUrl: string | null };
</script>

<AuditLog
  events={data.events}
  pagination={data.pagination}
  commitBaseUrl={data.commitBaseUrl}
  title={$_('orgSettings.audit.title')}
  description={$_('orgSettings.audit.description')}
/>
