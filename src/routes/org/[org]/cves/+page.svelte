<script lang="ts">
  import CveListView from '$lib/components/code-report/CveListView.svelte';
  import { _ } from 'svelte-i18n';

  export let data: {
    orgSlug: string;
    cves: {
      id: string;
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
      cvssScore: number | null;
      affectedServiceCount: number;
      occurrenceCount: number;
      projectSlugs: string[];
    }[];
    projects: { slug: string; name: string }[];
    initialProjectFilter: string;
  };

  $: baseHref = `/org/${data.orgSlug}/cves`;
</script>

<svelte:head>
  <title>{$_('org.cves.title')} - GitOps</title>
</svelte:head>

<CveListView
  cves={data.cves}
  {baseHref}
  showProjectFilter={true}
  projectOptions={data.projects}
  initialProjectFilter={data.initialProjectFilter}
  infoMessage={$_('org.cves.infoMessage')}
  emptyMessage={$_('org.cves.emptyMessage')}
/>
