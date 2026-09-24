<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, UserPlus } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: { settings: { registrationEnabled: boolean } };

  let registrationEnabled = data.settings.registrationEnabled;

  let saving = false;
  let error = '';
  let success = '';

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  const updateRegistration: SubmitFunction = () => {
    saving = true;
    error = '';
    return async ({ result, update }) => {
      await update();
      saving = false;

      if (result.type === 'success') {
        flashSuccess($_('clusterSettings.registration.updated'));
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('clusterSettings.registration.updateFailed');
    };
  };
</script>

<svelte:head>
  <title>{$_('clusterSettings.registration.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('clusterSettings.registration.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('clusterSettings.registration.description')}</p>
  </section>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <form method="POST" action="?/updateRegistration" use:enhance={updateRegistration}>
    <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="flex items-start gap-3 px-4 py-4">
        <input
          id="registration-enabled"
          name="registrationEnabled"
          type="checkbox"
          bind:checked={registrationEnabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
        />
        <div class="flex-1">
          <label
            for="registration-enabled"
            class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <UserPlus class="h-4 w-4" />
            {$_('clusterSettings.registration.enableLabel')}
          </label>
          <p class="mt-1 text-sm text-slate-600">
            {$_('clusterSettings.registration.enableDescription')}
          </p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="submit"
          disabled={saving}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          {saving ? $_('common.saving') : $_('common.save')}
        </button>
      </div>
    </section>
  </form>
</div>
