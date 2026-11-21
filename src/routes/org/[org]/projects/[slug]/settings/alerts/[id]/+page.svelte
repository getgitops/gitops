<script lang="ts">
  import { _ } from '#lib/i18n';
  import AlertEditor from '#lib/components/alerts/AlertEditor.svelte';
  import type { AlertEditorData, AlertFormResult } from '#lib/alerts/types';

  let { data, form }: { data: AlertEditorData; form: AlertFormResult } = $props();
</script>

<svelte:head>
  <title
    >{data.alertId ? $_('alerts.editor.editTitle') : $_('alerts.editor.newTitle')} - GitOps</title
  >
</svelte:head>

<!-- the editor renders its own header (back link, title and name) -->
{#key data.alertId}
  <AlertEditor {data} {form} />
{/key}
