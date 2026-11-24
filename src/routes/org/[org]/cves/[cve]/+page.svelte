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
      orgSlug: string;
      cve: CveDetail;
      remediations: CveRemediation[];
      affected: CveAffected[];
    };
  } = $props();
</script>

<svelte:head>
  <title>{data.cve.id} - CVEs - GitOps</title>
</svelte:head>

<CveDetailView
  cve={data.cve}
  remediations={data.remediations}
  affected={data.affected}
  backHref={`/org/${data.orgSlug}/cves`}
  showProject
  serviceHref={(service) =>
    `/org/${data.orgSlug}/projects/${service.projectSlug}/code-report/services/${service.serviceSlug}`}
/>
