<script lang="ts">
  import AuditLog from '$lib/components/AuditLog.svelte';
  import type { AuditEvent } from '$modules/audit';
  import { _ } from 'svelte-i18n';

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
  title={$_('clusterSettings.audit.title')}
  description={$_('clusterSettings.audit.description')}
/>
