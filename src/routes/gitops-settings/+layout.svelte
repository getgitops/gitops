<!--
  Ajustes de GitOps (solo administradores del clúster). Las pestañas de sección las pinta el
  layout raíz desde `#lib/navigation.ts`; cada página lleva su propia cabecera.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { _ } from '#lib/i18n';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>{$_('clusterSettings.title')} - GitOps</title>
</svelte:head>

{@render children()}
