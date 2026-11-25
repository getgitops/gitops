<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { Info, Save, ShieldAlert } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  type Multipliers = { critical: number; high: number; medium: number; low: number };

  type AnalysisTool = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    scanner?: string;
    soon?: boolean;
  };

  let {
    data,
  }: {
    data: {
      settings: { securityRiskMultipliers?: Multipliers };
      tools: AnalysisTool[];
      canUpdate: boolean;
    };
  } = $props();

  // si solo se han guardado herramientas, el proyecto aún no tiene multiplicadores
  const DEFAULTS: Multipliers = { critical: 10, high: 6, medium: 3, low: 1 };
  const saved = $derived({ ...DEFAULTS, ...data.settings.securityRiskMultipliers });

  let values = $state<Multipliers>(untrack(() => ({ ...saved })));
  let saving = $state(false);

  const dirty = $derived(
    (Object.keys(values) as (keyof Multipliers)[]).some(
      (key) => Number(values[key]) !== Number(saved[key]),
    ),
  );

  // mismo código de color que /brand: critical = danger, high = brand, medium = warn, low = neutro
  const severities: { key: keyof Multipliers; dot: string }[] = [
    { key: 'critical', dot: 'bg-red-400' },
    { key: 'high', dot: 'bg-brand-400' },
    { key: 'medium', dot: 'bg-amber-400' },
    { key: 'low', dot: 'bg-fg-subtle' },
  ];

  const submit: SubmitFunction = () => {
    saving = true;
    return async ({ result, update }) => {
      saving = false;
      if (result.type === 'success') {
        toast.success('Multiplicadores guardados');
        await update({ reset: false });
      } else if (result.type === 'failure') {
        toast.error(
          'No se pudieron guardar los ajustes',
          result.data?.error ? String(result.data.error) : undefined,
        );
      } else {
        await update();
      }
    };
  };
  let enabled = $state<Record<string, boolean>>(
    untrack(() => Object.fromEntries(data.tools.map((tool) => [tool.id, tool.enabled]))),
  );
  let savingTools = $state(false);

  const toolsDirty = $derived(
    data.tools.some((tool) => !tool.soon && enabled[tool.id] !== tool.enabled),
  );

  const submitTools: SubmitFunction = () => {
    savingTools = true;
    return async ({ result, update }) => {
      savingTools = false;
      if (result.type === 'success') {
        toast.success('Herramientas guardadas');
        await update({ reset: false });
      } else if (result.type === 'failure') {
        toast.error(
          'No se pudieron guardar las herramientas',
          result.data?.error ? String(result.data.error) : undefined,
        );
      } else {
        await update();
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('codeReport.settings.title')} - Code Report</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('codeReport.settings.title')}
    </h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('codeReport.settings.generalDescription')}</p>
  </header>

  <form method="POST" action="?/updateRiskMultipliers" use:enhance={submit} class="k-card">
    <div class="flex items-start gap-4 border-b border-white/8 px-6 py-5">
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><ShieldAlert class="h-5 w-5" /></span
      >
      <div>
        <h2 class="font-semibold text-white">{$_('codeReport.settings.riskMultipliers')}</h2>
        <p class="mt-0.5 text-sm text-fg-muted">{$_('codeReport.settings.formulaDescription')}</p>
      </div>
    </div>

    <div class="space-y-5 px-6 py-5">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#each severities as severity (severity.key)}
          <div>
            <label class="k-label flex items-center gap-2" for="multiplier-{severity.key}">
              <span class="h-2 w-2 rounded-full {severity.dot}"></span>
              {$_(`codeReport.settings.${severity.key}`)}
            </label>
            <div class="relative">
              <span
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-fg-subtle"
                >×</span
              >
              <input
                id="multiplier-{severity.key}"
                type="number"
                name={severity.key}
                min="1"
                step="1"
                required
                disabled={!data.canUpdate}
                bind:value={values[severity.key]}
                class="k-input pl-7 font-mono tabular-nums"
              />
            </div>
          </div>
        {/each}
      </div>

      <div
        class="flex gap-2.5 rounded-lg border border-sky-500/25 bg-sky-500/6 p-3 text-xs text-sky-200"
      >
        <Info class="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <div class="space-y-1">
          <p class="font-mono">
            (Critical × {values.critical}) + (High × {values.high}) + (Medium × {values.medium}) +
            (Low × {values.low})
          </p>
          <p>{$_('codeReport.settings.ranges')}</p>
        </div>
      </div>
    </div>

    {#if data.canUpdate}
      <div
        class="flex items-center justify-end gap-3 rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-6 py-4"
      >
        {#if dirty}<span class="text-xs text-fg-subtle">Cambios sin guardar</span>{/if}
        <button type="submit" class="k-btn k-btn-primary" disabled={saving || !dirty}>
          <Save class="h-4 w-4" />
          {saving ? $_('common.saving') : $_('projectSettings.overview.saveChanges')}
        </button>
      </div>
    {/if}
  </form>

  <form method="POST" action="?/updateTools" use:enhance={submitTools} class="k-card">
    <div class="border-b border-white/8 px-6 py-5">
      <h2 class="font-semibold text-white">{$_('codeReport.settings.toolsTitle')}</h2>
      <p class="mt-0.5 max-w-3xl text-sm text-fg-muted">
        {$_('codeReport.settings.toolsDescription')}
      </p>
    </div>

    <ul class="divide-y divide-white/6">
      {#each data.tools as tool (tool.id)}
        <li>
          <label
            class="flex items-start gap-4 px-6 py-4 transition-colors {tool.soon || !data.canUpdate
              ? 'cursor-not-allowed'
              : 'cursor-pointer hover:bg-white/2.5'}"
          >
            <input
              type="checkbox"
              class="k-checkbox mt-0.5"
              name="tools"
              value={tool.id}
              bind:checked={enabled[tool.id]}
              disabled={tool.soon || !data.canUpdate}
            />
            <span class="min-w-0 flex-1 {tool.soon ? 'opacity-60' : ''}">
              <span class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {tool.name}
                {#if tool.soon}
                  <span class="k-badge k-badge-brand">{$_('codeReport.settings.soon')}</span>
                {:else if enabled[tool.id]}
                  <span class="k-badge k-badge-ok"
                    ><span class="h-1.5 w-1.5 rounded-full bg-ok"></span>{$_(
                      'codeReport.settings.enabled',
                    )}</span
                  >
                {:else}
                  <span class="k-badge">{$_('codeReport.settings.disabled')}</span>
                {/if}
              </span>
              <span class="mt-1 block text-sm text-fg-muted">{tool.description}</span>
              {#if tool.scanner}
                <span class="mt-1.5 block font-mono text-xs text-fg-subtle">{tool.scanner}</span>
              {/if}
            </span>
          </label>
        </li>
      {/each}
    </ul>

    {#if data.canUpdate}
      <div
        class="flex items-center justify-end gap-3 rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-6 py-4"
      >
        {#if toolsDirty}<span class="text-xs text-fg-subtle">Cambios sin guardar</span>{/if}
        <button type="submit" class="k-btn k-btn-primary" disabled={savingTools || !toolsDirty}>
          <Save class="h-4 w-4" />
          {savingTools ? $_('common.saving') : $_('projectSettings.overview.saveChanges')}
        </button>
      </div>
    {/if}
  </form>
</div>
