<!--
  "Nuevo monitor" en un modal (panel y listado). Envía a las acciones de /monitors/new y, al
  guardar, navega al monitor creado. La página /monitors/new sigue existiendo para enlaces
  directos y sin JavaScript.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Activity, FlaskConical, LoaderCircle, Save } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import MonitorForm from './MonitorForm.svelte';
  import type { MonitorFormValues, ServiceOption } from './types';

  let {
    open = $bindable(false),
    monitoringBase,
    services,
    methods,
    intervals,
    values,
    canTest = true,
  }: {
    open?: boolean;
    monitoringBase: string;
    services: ServiceOption[];
    methods: readonly string[];
    intervals: readonly number[];
    values: MonitorFormValues;
    canTest?: boolean;
  } = $props();

  const uid = $props.id();
  const formId = `new-monitor-${uid}`;
  const action = $derived(`${monitoringBase}/monitors/new`);
  let intent = $state<'save' | 'test' | null>(null);
  // cada apertura empieza con el formulario limpio
  let session = $state(0);
  $effect(() => {
    if (open) untrack(() => (session += 1));
  });
</script>

<Modal
  bind:open
  size="lg"
  dismissible={intent === null}
  title={$_('monitoring.newMonitor')}
  description={$_('monitoring.form.intro')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><Activity class="h-5 w-5" /></span
    >
  {/snippet}

  {#key session}
    <MonitorForm
      {values}
      {services}
      {methods}
      {intervals}
      {canTest}
      {action}
      {formId}
      variant="modal"
      bind:intent
      onsaved={() => toast.success($_('monitoring.created'))}
    />
  {/key}

  {#snippet footer()}
    <button type="button" class="k-btn k-btn-ghost" onclick={() => (open = false)}
      >{$_('common.cancel')}</button
    >
    {#if canTest}
      <button
        type="submit"
        form={formId}
        formaction="{action}?/test"
        class="k-btn k-btn-secondary"
        disabled={intent !== null}
      >
        {#if intent === 'test'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
            class="h-4 w-4"
          />{/if}
        {$_('monitoring.form.test')}
      </button>
    {/if}
    <button type="submit" form={formId} class="k-btn k-btn-primary" disabled={intent !== null}>
      {#if intent === 'save'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
          class="h-4 w-4"
        />{/if}
      {$_('monitoring.form.create')}
    </button>
  {/snippet}
</Modal>
