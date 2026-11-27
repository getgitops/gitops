<script lang="ts">
  import CveDetailView, {
    type CveAffected,
    type CveDetail,
    type CveRemediation,
  } from '#lib/components/code-report/CveDetailView.svelte';
  import FeedAdvisorySection from '#lib/components/cves/FeedAdvisorySection.svelte';
  import type { CveAdvisory, ScanRef } from '#modules/cve-feed';

  let {
    data,
  }: {
    data: {
      orgSlug: string;
      scans: boolean;
      cve: CveDetail;
      remediations: CveRemediation[];
      affected: CveAffected[];
      feed: {
        advisory: CveAdvisory;
        affectsMe: boolean;
        occurrences: ScanRef[];
        technologies: { id: string; name: string }[];
      } | null;
    };
  } = $props();
</script>

<svelte:head>
  <title>{data.cve.id} - CVEs - GitOps</title>
</svelte:head>

{#snippet feedSection()}
  {#if data.feed}
    <FeedAdvisorySection
      advisory={data.feed.advisory}
      technologies={data.feed.technologies}
      affectsMe={data.feed.affectsMe}
      occurrences={data.feed.occurrences}
      serviceHref={(service) =>
        `/org/${data.orgSlug}/projects/${service.projectSlug}/code-report/services/${service.serviceSlug}`}
    />
  {/if}
{/snippet}

<CveDetailView
  cve={data.cve}
  remediations={data.remediations}
  affected={data.affected}
  scans={data.scans}
  feed={data.feed ? feedSection : undefined}
  backHref={`/org/${data.orgSlug}/cves${data.scans ? '' : '?tab=technology'}`}
  showProject
  serviceHref={(service) =>
    `/org/${data.orgSlug}/projects/${service.projectSlug}/code-report/services/${service.serviceSlug}`}
/>
