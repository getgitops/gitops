<script lang="ts">
  import { enhance } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import { ArrowLeft, Boxes, History, Trash2 } from '@lucide/svelte';
  import CodeReportVisualization from '#lib/components/CodeReportVisualization.svelte';
  import ServiceMonitors from '#lib/components/monitoring/ServiceMonitors.svelte';
  import type { MonitorRowData } from '#lib/components/monitoring/types';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  let {
    data,
  }: {
    data: {
      service: {
        id: string;
        name: string;
        slug: string;
        description?: string | null;
        tags?: string[];
      };
      latestAnalysis: any;
      latestByTool: Record<string, any>;
      analysisHistory: any[];
      riskWeights: { critical: number; high: number; medium: number; low: number };
      project?: { slug?: string; organization?: { slug?: string | null } | null };
      canCreate: boolean;
      canDelete: boolean;
      monitoring: { base: string; canCreate: boolean; monitors: MonitorRowData[] } | null;
    };
  } = $props();

  const page = createPageStore();
  const orgSlug = $derived(data.project?.organization?.slug ?? $page.params.org ?? '');
  const projectSlug = $derived(data.project?.slug ?? $page.params.slug ?? '');
  const codeReportBase = $derived(`/org/${orgSlug}/projects/${projectSlug}/code-report`);
  const historyHref = $derived(`${codeReportBase}/history?service=${data.service.slug}`);

  let deleteOpen = $state(false);
  let deleting = $state(false);
  let confirmText = $state('');

  function openDelete() {
    confirmText = '';
    deleteOpen = true;
  }
</script>

<svelte:head><title>{data.service.name} - Code Report - GitOps</title></svelte:head>

<div class="space-y-6">
  <a
    href={`${codeReportBase}/services`}
    class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
  >
    <ArrowLeft class="h-3.5 w-3.5" />{$_('codeReport.serviceDetail.backToServices')}
  </a>

  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-4">
      <span
        class="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><Boxes class="h-6 w-6" /></span
      >
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight text-white">
          {data.service.name}
        </h1>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span class="font-mono text-xs text-fg-subtle">{data.service.slug}</span>
          {#each data.service.tags ?? [] as tag (tag)}
            <span class="k-badge">{tag}</span>
          {/each}
        </div>
        {#if data.service.description}
          <p class="mt-2 max-w-2xl text-sm text-fg-muted">{data.service.description}</p>
        {/if}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <a href={historyHref} class="k-btn k-btn-secondary">
        <History class="h-4 w-4" />{$_('codeReport.serviceDetail.viewHistory')}
      </a>
      {#if data.canDelete}
        <button
          type="button"
          class="k-btn k-btn-ghost k-btn-icon hover:text-red-400"
          aria-label={$_('codeReport.serviceDetail.deleteService')}
          title={$_('codeReport.serviceDetail.deleteService')}
          onclick={openDelete}
        >
          <Trash2 class="h-4 w-4" />
        </button>
      {/if}
    </div>
  </header>

  <CodeReportVisualization
    service={data.service}
    analysis={data.latestAnalysis}
    latestByTool={data.latestByTool}
    analysisHistory={data.analysisHistory}
    riskWeights={data.riskWeights}
    securityPoliciesHref={`${codeReportBase}/security-policy`}
  >
    {#snippet aside()}
      {#if data.monitoring}
        <ServiceMonitors serviceId={data.service.id} monitoring={data.monitoring} />
      {/if}
    {/snippet}
  </CodeReportVisualization>
</div>

{#if data.canDelete}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    dismissible={!deleting}
    title={$_('codeReport.serviceDetail.deleteTitle')}
    description="{$_('codeReport.serviceDetail.deleteDescriptionStart')} {data.service.name} {$_(
      'codeReport.serviceDetail.deleteDescriptionEnd',
    )}"
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    <form
      id="form-borrar-servicio"
      method="POST"
      action="?/deleteService"
      use:enhance={() => {
        deleting = true;
        const name = data.service.name;
        return async ({ result, update }) => {
          deleting = false;
          if (result.type === 'redirect' || result.type === 'success') {
            deleteOpen = false;
            toast.success('Servicio borrado', name);
          } else if (result.type === 'failure') {
            toast.error(
              'No se pudo borrar el servicio',
              result.data?.error ? String(result.data.error) : undefined,
            );
            return;
          }
          await update();
        };
      }}
    >
      <Field label="Escribe {data.service.slug} para confirmar">
        {#snippet children(control)}
          <input
            class="k-input font-mono text-[13px]"
            autocomplete="off"
            spellcheck="false"
            data-autofocus
            bind:value={confirmText}
            {...control}
          />
        {/snippet}
      </Field>
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
        >{$_('codeReport.serviceDetail.cancel')}</button
      >
      <button
        type="submit"
        form="form-borrar-servicio"
        class="k-btn k-btn-danger"
        disabled={deleting || confirmText !== data.service.slug}
        >{deleting
          ? $_('codeReport.serviceDetail.deleting')
          : $_('codeReport.serviceDetail.deleteServiceAndAnalyses')}</button
      >
    {/snippet}
  </Modal>
{/if}
