<script lang="ts">
  import StackDetail from '#lib/components/state-iac/StackDetail.svelte';
  import type { StackDetailView } from '#lib/state-iac/types';

  type Props = {
    data: {
      detail: StackDetailView;
      projectName: string | null;
      backHref: string;
      apiBase: string;
      scopeQuery: string;
    };
  };
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{data.detail.summary.ref.stack} · State IaC · GitOps</title>
</svelte:head>

<StackDetail
  apiBase={data.apiBase}
  scopeQuery={data.scopeQuery}
  canReadHistory={true}
  detail={data.detail}
  canReadStates={true}
  backHref={data.backHref}
  projectName={data.projectName}
/>
