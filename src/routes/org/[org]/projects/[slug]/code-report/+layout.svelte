<script lang="ts">
  import { createPageStore } from '#lib/page-store';

  export let data: {
    project?: {
      slug?: string | null;
      organization?: { slug?: string | null } | null;
    };
  };

  $: orgSlug = data?.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data?.project?.slug ?? $page?.params?.slug ?? '';
  

  const page = createPageStore();
</script>

<div class="space-y-6">

  <slot />
</div>
