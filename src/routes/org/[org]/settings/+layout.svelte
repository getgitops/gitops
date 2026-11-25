<!-- Mismo contenedor que los ajustes de proyecto: la cabecera la dan las migas y las pestañas del layout raíz. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { _ } from '#lib/i18n';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>{$_('orgSettings.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl">
  {@render children()}
</div>
