<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';

  export let data: { events: AuditEvent[] };
</script>

<AuditLog
  events={data.events}
  title="Cluster Audit Log"
  description="History of changes recorded across the cluster's data repository."
/>
