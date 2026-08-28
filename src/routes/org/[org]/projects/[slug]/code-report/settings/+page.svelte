<script lang="ts">
  import { enhance } from '$app/forms';
  import { ShieldAlert, Info, Save, SlidersHorizontal } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';

  export let data;

  $: settings = data.settings;
  $: multipliers = settings.securityRiskMultipliers;

  let loading = false;
</script>

<svelte:head>
  <title>{$_('codeReport.settings.generalTitle')} - Code Report</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <div class="flex items-center gap-2">
      <SlidersHorizontal class="h-4 w-4 text-slate-600" />
      <h1 class="text-sm font-semibold text-slate-900">{$_('codeReport.settings.generalTitle')}</h1>
    </div>
    <p class="mt-1 text-sm text-slate-500">{$_('codeReport.settings.generalDescription')}</p>
  </div>

  <form
    method="POST"
    action="?/updateRiskMultipliers"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
    class="space-y-6"
  >
    <section class="space-y-4 rounded-md border border-slate-200 bg-slate-50/50 p-4">
      <div class="flex items-center gap-2">
        <ShieldAlert class="h-4 w-4 text-slate-700" />
        <h2 class="text-sm font-semibold text-slate-900">{$_('codeReport.settings.riskMultipliers')}</h2>
      </div>

      <p class="text-xs text-slate-600">{$_('codeReport.settings.formulaDescription')}</p>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="space-y-1.5">
          <span class="block text-xs font-medium text-red-700">{$_('codeReport.settings.critical')}</span>
          <input type="number" id="critical" name="critical" min="1" value={multipliers.critical} class="field-input w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 outline-none transition" required />
        </label>

        <label class="space-y-1.5">
          <span class="block text-xs font-medium text-orange-700">{$_('codeReport.settings.high')}</span>
          <input type="number" id="high" name="high" min="1" value={multipliers.high} class="field-input w-full rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 outline-none transition" required />
        </label>

        <label class="space-y-1.5">
          <span class="block text-xs font-medium text-amber-700">{$_('codeReport.settings.medium')}</span>
          <input type="number" id="medium" name="medium" min="1" value={multipliers.medium} class="field-input w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 outline-none transition" required />
        </label>

        <label class="space-y-1.5">
          <span class="block text-xs font-medium text-slate-700">{$_('codeReport.settings.low')}</span>
          <input type="number" id="low" name="low" min="1" value={multipliers.low} class="field-input w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition" required />
        </label>
      </div>

      <div class="rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800">
        <div class="flex items-start gap-2">
          <Info class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="space-y-1">
            <p>{$_('codeReport.settings.example')}</p>
            <p>{$_('codeReport.settings.ranges')}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3">
      <h3 class="text-sm font-semibold text-slate-900">{$_('codeReport.settings.moreSettings')}</h3>
      <p class="mt-1 text-xs text-slate-500">{$_('codeReport.settings.moreSettingsDescription')}</p>
    </section>

    <div class="flex items-center justify-end border-t border-slate-200 pt-4">
      <button type="submit" disabled={loading} class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
        <Save class="h-4 w-4" />
        {loading ? $_('common.saving') : $_('projectSettings.overview.saveChanges')}
      </button>
    </div>
  </form>
</div>
