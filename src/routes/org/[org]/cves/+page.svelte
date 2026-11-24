<script lang="ts">
  import CveListView, { type CveListItem } from '#lib/components/code-report/CveListView.svelte';
  import { _ } from '#lib/i18n';

  let {
    data,
  }: {
    data: {
      orgSlug: string;
      cves: CveListItem[];
      projects: { slug: string; name: string }[];
      initialProject: string;
    };
  } = $props();
</script>

<svelte:head>
  <title>{$_('org.cves.title')} - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('org.cves.title')}</h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('org.cves.infoMessage')}</p>
  </header>

  <CveListView
    cves={data.cves}
    cveHref={(id) => `/org/${data.orgSlug}/cves/${encodeURIComponent(id)}`}
    projects={data.projects}
    initialProject={data.initialProject}
    emptyMessage={$_('org.cves.emptyMessage')}
  />
</div>
