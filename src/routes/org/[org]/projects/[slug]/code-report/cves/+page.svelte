<script lang="ts">
  import { page } from '$app/stores';
  import CveListView from '$lib/components/code-report/CveListView.svelte';

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
  <title>Code Report - CVEs - GitOps</title>
</svelte:head>

<CveListView
  cves={data.cves}
  {baseHref}
  infoMessage="Este listado muestra los CVEs detectados en el ultimo analisis de cada servicio. Los servicios sin un analisis reciente completado no aparecen reflejados aqui."
  emptyMessage="Todavia no se han detectado CVEs en este proyecto."
/>
