<script lang="ts">
  import { page } from '$app/stores';
  import CveListView from '$lib/components/code-report/CveListView.svelte';
  import { _ } from '$lib/i18n';

  type CveRow = {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
    cvssScore: number | null;
    affectedServiceCount: number;
    occurrenceCount: number;
  };

  export let data: { cves: CveRow[] };

  $: orgSlug = $page?.params?.org ?? '';
  $: projectSlug = $page?.params?.slug ?? '';
  $: baseHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/cves`;
</script>

<svelte:head>
  <title>{$_('codeReport.cves.title')} - GitOps</title>
</svelte:head>

<CveListView
  cves={data.cves}
  {baseHref}
  infoMessage={$_('codeReport.cves.infoMessage')}
  emptyMessage={$_('codeReport.cves.emptyMessage')}
/>
