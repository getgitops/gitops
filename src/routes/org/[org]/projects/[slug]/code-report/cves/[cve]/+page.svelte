<script lang="ts">
  import { page } from '$app/stores';
  import CveDetailView from '$lib/components/code-report/CveDetailView.svelte';

  export let data: {
    cve: {
      id: string;
      title: string;
      description: string;
      severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
      cvssScore: number | null;
      epssScore: number | null;
      epssPercentile: number | null;
      primaryUrl: string;
      cveUrl: string;
      cweIds: string[];
      references: string[];
      publishedDate: string | null;
      lastModifiedDate: string | null;
    };
    remediations: {
      packageName: string;
      installedVersion: string;
      fixedVersion: string;
      status: string;
    }[];
    affectedServices: {
      serviceId: string;
      serviceSlug: string;
      serviceName: string;
      packageName: string;
      installedVersion: string;
      fixedVersion: string;
      target: string;
      severity: string;
      status: string;
      scannedAt: string | null;
    }[];
  };

  $: orgSlug = $page?.params?.org ?? '';
  $: projectSlug = $page?.params?.slug ?? '';
  $: cvesHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/cves`;
</script>

<svelte:head>
  <title>{data.cve.id} - Code Report - GitVault Suite</title>
</svelte:head>

<CveDetailView
  cve={data.cve}
  remediations={data.remediations}
  affectedServices={data.affectedServices}
  {cvesHref}
  {orgSlug}
  defaultProjectSlug={projectSlug}
/>
