<!--
  Confirmación de borrado de un monitor (listado y detalle). El formulario va fuera del Modal y
  el botón del pie lo envía con form="…".
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Trash2 } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  let {
    open = $bindable(false),
    name,
    id = null,
  }: {
    open?: boolean;
    name: string;
    /** Solo en el listado: la acción del detalle ya sabe qué monitor borra. */
    id?: string | null;
  } = $props();

  const uid = $props.id();
  const formId = `delete-monitor-${uid}`;
  let deleting = $state(false);
</script>

<form
  id={formId}
  method="POST"
  action="?/delete"
  hidden
  use:enhance={() => {
    deleting = true;
    return async ({ result, update }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        toast.success($_('monitoring.delete.done'), name);
        open = false;
      }
      await update();
      deleting = false;
    };
  }}
>
  {#if id}<input type="hidden" name="id" value={id} />{/if}
</form>

<Modal
  bind:open
  role="alertdialog"
  size="sm"
  dismissible={!deleting}
  title={$_('monitoring.delete.title')}
  description={$_('monitoring.delete.description', { values: { name } })}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (open = false)}
      >{$_('common.cancel')}</button
    >
    <button form={formId} class="k-btn k-btn-danger" disabled={deleting} data-autofocus
      >{$_('monitoring.actions.delete')}</button
    >
  {/snippet}
</Modal>
