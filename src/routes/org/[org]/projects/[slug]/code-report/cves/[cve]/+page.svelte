<script lang="ts">
  import CveDetailView, {
    type CveAffected,
    type CveDetail,
    type CveRemediation,
  } from '#lib/components/code-report/CveDetailView.svelte';

  let {
    data,
  }: {
    data: {
      cve: CveDetail;
      remediations: CveRemediation[];
      affected: CveAffected[];
      project: { slug: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const orgSlug = $derived(data.project.organization?.slug ?? '');
  const base = $derived(`/org/${orgSlug}/projects/${data.project.slug}/code-report`);
</script>

<svelte:head>
  <title>{data.cve.id} - Code Report - GitOps</title>
</svelte:head>

<CveDetailView
  cve={data.cve}
  remediations={data.remediations}
  affected={data.affected}
  backHref={`${base}/cves`}
  serviceHref={(service) =>
    `/org/${orgSlug}/projects/${service.projectSlug}/code-report/services/${service.serviceSlug}`}
/>
