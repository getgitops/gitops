<script lang="ts">
  import CveListView, { type CveListItem } from '#lib/components/code-report/CveListView.svelte';

  let {
    data,
  }: {
    data: {
      cves: CveListItem[];
      project: { slug: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const base = $derived(
    `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/code-report/cves`,
  );
</script>

<svelte:head>
  <title>CVEs - Code Report - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">CVEs del proyecto</h1>
    <p class="mt-1 text-sm text-fg-muted">
      Vulnerabilidades conocidas en el último análisis de cada servicio, agrupadas por CVE.
    </p>
  </header>

  <CveListView
    cves={data.cves}
    cveHref={(id) => `${base}/${encodeURIComponent(id)}`}
    emptyMessage="Ningún servicio del proyecto tiene CVEs en su último análisis de vulnerabilidades."
  />
</div>
