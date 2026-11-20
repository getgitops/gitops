<script lang="ts">
  import { _ } from '#lib/i18n';
  import AlertList from '#lib/components/alerts/AlertList.svelte';
  import type { AlertListData } from '#lib/alerts/types';

  let { data, form }: { data: AlertListData; form: { error?: string } | null } = $props();
</script>

<svelte:head>
  <title>{$_('alerts.list.title')} - GitOps</title>
</svelte:head>

<AlertList {data} error={form?.error ?? ''} />
