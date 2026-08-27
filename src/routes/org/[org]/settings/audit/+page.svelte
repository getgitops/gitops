<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';

  export let data: { events: AuditEvent[]; commitBaseUrl: string | null };
</script>

<AuditLog
  events={data.events}
  commitBaseUrl={data.commitBaseUrl}
  title="Auditoría"
  description="Historial de cambios registrados en los datos de esta organización."
/>
