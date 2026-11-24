<!--
  Página completa del editor de alertas sin JS (/alerts/new y /alerts/[id]), compartida por
  los ajustes de organización y de proyecto.
-->
<script lang="ts">
  import { _ } from '#lib/i18n';
  import AlertEditor from './AlertEditor.svelte';
  import type { AlertEditorData, AlertFormResult } from '#lib/alerts/types';

  let { data, form }: { data: AlertEditorData; form: AlertFormResult } = $props();

  const title = $derived(
    data.alertId ? $_('alerts.editor.editTitle') : $_('alerts.editor.newTitle'),
  );
</script>

<svelte:head>
  <title>{title} - GitOps</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight text-white">{title}</h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('alerts.editor.subtitle')}</p>
  </header>
  {#key data.alertId}
    <AlertEditor {data} {form} />
  {/key}
</div>
