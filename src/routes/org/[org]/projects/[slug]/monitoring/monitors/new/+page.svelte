<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import MonitorForm from '#lib/components/monitoring/MonitorForm.svelte';
  import type { MonitorFormValues, TestResult } from '#lib/components/monitoring/types';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let values = $derived((form?.values as MonitorFormValues | undefined) ?? data.values);
  let errors = $derived((form && 'errors' in form ? form.errors : {}) as Record<string, string>);
  let test = $derived((form && 'test' in form ? form.test : null) as TestResult | null);
</script>

<svelte:head><title>{$_('monitoring.newMonitor')} - {data.project.name}</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div>
    <a
      href={`${data.monitoringBase}/monitors`}
      class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
    >
      <ArrowLeft class="h-3.5 w-3.5" />{$_('monitoring.backToMonitors')}
    </a>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight text-white">{$_('monitoring.newMonitor')}</h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('monitoring.form.intro')}</p>
  </div>

  <MonitorForm
    {values}
    {errors}
    {test}
    services={data.services}
    methods={data.methods}
    intervals={data.intervals}
    canTest={data.monitoringPermissions.canTest}
    cancelHref={`${data.monitoringBase}/monitors`}
  />
</div>
