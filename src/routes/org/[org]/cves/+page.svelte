<script lang="ts">
  import CveListView, { type CveListItem } from '#lib/components/code-report/CveListView.svelte';
  import FeedTab, { type FeedData } from '#lib/components/cves/FeedTab.svelte';
  import { Tabs, tabPanelId } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  let {
    data,
    form,
  }: {
    data: {
      orgSlug: string;
      tab: 'mine' | 'technology';
      canFeed: boolean;
      cves?: CveListItem[];
      projects?: { slug: string; name: string }[];
      initialProject?: string;
      feed?: FeedData;
    };
    form?: { action?: string; success?: boolean; error?: string } | null;
  } = $props();

  const tabs = $derived([
    { value: 'mine', label: $_('org.cves.tabMine'), href: '?tab=mine' },
    { value: 'technology', label: $_('org.cves.tabTechnology'), href: '?tab=technology' },
  ]);
</script>

<svelte:head>
  <title>{$_('org.cves.title')} - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('org.cves.title')}</h1>
    <p class="mt-1 text-sm text-fg-muted">
      {data.tab === 'technology' ? $_('org.cves.feed.infoMessage') : $_('org.cves.infoMessage')}
    </p>
  </header>

  {#if data.canFeed}
    <Tabs items={tabs} value={data.tab} label={$_('org.cves.tabsLabel')} idPrefix="cves" />
  {/if}

  <div id={tabPanelId('cves', data.tab)}>
    {#if data.tab === 'technology' && data.feed}
      <FeedTab orgSlug={data.orgSlug} feed={data.feed} {form} />
    {:else}
      <CveListView
        cves={data.cves ?? []}
        cveHref={(id) => `/org/${data.orgSlug}/cves/${encodeURIComponent(id)}`}
        projects={data.projects ?? []}
        initialProject={data.initialProject ?? 'all'}
        emptyMessage={$_('org.cves.emptyMessage')}
      />
    {/if}
  </div>
</div>
