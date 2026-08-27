<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';

  type Pagination = { page: number; perPage: number; total: number; totalPages: number };

  export let data: { events: AuditEvent[]; pagination: Pagination; commitBaseUrl: string | null };
</script>

<AuditLog
  events={data.events}
  pagination={data.pagination}
  commitBaseUrl={data.commitBaseUrl}
  title="Auditoría"
  description="Historial de cambios registrados en los datos de esta organización."
/>
