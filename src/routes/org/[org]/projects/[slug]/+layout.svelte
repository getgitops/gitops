<!-- La cabecera del proyecto se sustituye por las migas de pan del layout raíz. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto w-full max-w-7xl">
  {@render children()}
</div>
