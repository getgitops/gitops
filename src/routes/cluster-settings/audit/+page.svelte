<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';

  type Organization = { id: string; name: string };
  type Pagination = { page: number; perPage: number; total: number; totalPages: number };

  export let data: {
    events: AuditEvent[];
    pagination: Pagination;
    organizations: Organization[];
    commitBaseUrl: string | null;
  };
</script>

<AuditLog
  events={data.events}
  pagination={data.pagination}
  organizations={data.organizations}
  commitBaseUrl={data.commitBaseUrl}
  title="Cluster Audit Log"
  description="History of changes recorded across the cluster's data repository."
/>
