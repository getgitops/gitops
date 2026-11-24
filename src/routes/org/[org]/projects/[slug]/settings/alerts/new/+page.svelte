<script lang="ts">
  import AlertEditorPage from '#lib/components/alerts/AlertEditorPage.svelte';
  import type { AlertEditorData, AlertFormResult } from '#lib/alerts/types';

  let { data, form }: { data: AlertEditorData; form: AlertFormResult } = $props();
</script>

<AlertEditorPage {data} {form} />
