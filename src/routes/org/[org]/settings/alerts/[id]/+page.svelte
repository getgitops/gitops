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

<div class="space-y-6">
  <div>
    <h3 class="text-xl font-semibold text-slate-900">
      {data.alertId ? $_('alerts.editor.editTitle') : $_('alerts.editor.newTitle')}
    </h3>
    <p class="mt-2 text-sm text-slate-600">{$_('alerts.editor.subtitle')}</p>
  </div>
  {#key data.alertId}
    <AlertEditor {data} {form} />
  {/key}
</div>
