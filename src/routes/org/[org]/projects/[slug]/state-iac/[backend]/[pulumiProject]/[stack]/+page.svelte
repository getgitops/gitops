<script lang="ts">
  import StackDetail from '#lib/components/state-iac/StackDetail.svelte';
  import type { StackDetailView } from '#lib/state-iac/types';

  type Props = {
    data: {
      detail: StackDetailView;
      canReadStates: boolean;
      backHref: string;
      project: { name: string };
    };
  };
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{data.detail.summary.ref.stack} · State IaC - {data.project.name}</title>
</svelte:head>

<StackDetail detail={data.detail} canReadStates={data.canReadStates} backHref={data.backHref} />
