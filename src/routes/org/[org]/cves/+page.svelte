<script lang="ts">
  import CveListView from '$lib/components/code-report/CveListView.svelte';

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
  <title>Organization CVEs - GitOps</title>
</svelte:head>

<CveListView
  cves={data.cves}
  {baseHref}
  showProjectFilter={true}
  projectOptions={data.projects}
  initialProjectFilter={data.initialProjectFilter}
  infoMessage="Este listado agrega CVEs de todos los proyectos de la organizacion, usando el ultimo analisis completado de cada servicio."
  emptyMessage="Todavia no se han detectado CVEs en esta organizacion."
/>
