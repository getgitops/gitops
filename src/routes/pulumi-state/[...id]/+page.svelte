<script lang="ts">
  import StackDetailPage from '../../projects/[...id]/+page.svelte';

  export let data: any;
</script>

<StackDetailPage {data} />