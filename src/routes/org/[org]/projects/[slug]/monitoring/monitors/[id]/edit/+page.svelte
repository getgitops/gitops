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
  let detailHref = $derived(`${data.monitoringBase}/monitors/${data.monitor.id}`);
</script>

<svelte:head
  ><title>{$_('monitoring.editMonitor')} · {data.monitor.name} - {data.project.name}</title
  ></svelte:head
>

<div class="mx-auto max-w-3xl space-y-6">
  <div>
    <a
      href={detailHref}
      class="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
    >
      <ArrowLeft class="h-3.5 w-3.5" />{data.monitor.name}
    </a>
    <h1 class="mt-3 text-2xl font-bold text-white">{$_('monitoring.editMonitor')}</h1>
  </div>

  <MonitorForm
    {values}
    {errors}
    {test}
    editing
    storedHeaderNames={data.monitor.headerNames}
    hasStoredBody={data.monitor.hasBody}
    services={data.services}
    methods={data.methods}
    intervals={data.intervals}
    canTest={data.monitoringPermissions.canTest}
    cancelHref={detailHref}
  />
</div>
