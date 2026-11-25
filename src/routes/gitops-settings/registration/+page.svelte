<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { ExternalLink, Info, UserPlus } from '@lucide/svelte';
  import { Switch, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  let { data }: { data: { settings: { registrationEnabled: boolean } } } = $props();

  // valor optimista: se reescribe al volver los datos del servidor
  let enabled = $derived(data.settings.registrationEnabled);
  let saving = $state(false);
  let form = $state<HTMLFormElement>();

  async function submit() {
    // el Switch actualiza su input oculto en el siguiente render
    await tick();
    form?.requestSubmit();
  }

  const submitRegistration: SubmitFunction = () => {
    saving = true;
    return async ({ result, update }) => {
      saving = false;
      if (result.type === 'success') {
        toast.success(
          $_('clusterSettings.registration.updated'),
          enabled ? 'Cualquiera puede crear una cuenta.' : 'Solo se entra por invitación.',
        );
      } else if (result.type === 'failure') {
        toast.error(
          $_('clusterSettings.registration.updateFailed'),
          result.data?.error ? String(result.data.error) : undefined,
        );
      }
      await update({ reset: false });
    };
  };
</script>

<svelte:head>
  <title>{$_('clusterSettings.registration.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('clusterSettings.registration.title')}
    </h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('clusterSettings.registration.description')}</p>
  </header>

  <form
    bind:this={form}
    method="POST"
    action="?/updateRegistration"
    class="k-card"
    use:enhance={submitRegistration}
  >
    <div class="flex items-start gap-4 px-6 py-5">
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><UserPlus class="h-5 w-5" /></span
      >
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold text-white" id="registration-label">
            {$_('clusterSettings.registration.enableLabel')}
          </h2>
          <span class="k-badge {enabled ? 'k-badge-ok' : ''}">
            <span class="h-1.5 w-1.5 rounded-full {enabled ? 'bg-ok' : 'bg-fg-subtle'}"></span>
            {enabled ? 'Abierto' : 'Solo por invitación'}
          </span>
        </div>
        <p class="mt-1 text-sm text-fg-muted" id="registration-help">
          {$_('clusterSettings.registration.enableDescription')}
        </p>
      </div>
      <Switch
        name="registrationEnabled"
        label={$_('clusterSettings.registration.enableLabel')}
        aria-describedby="registration-help"
        bind:checked={enabled}
        disabled={saving}
        onchange={submit}
      />
    </div>
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-6 py-3 text-xs text-fg-subtle"
    >
      <span class="flex items-center gap-1.5">
        <Info class="h-3.5 w-3.5" />Las cuentas nuevas no ven las organizaciones existentes hasta
        que las inviten.
      </span>
      <a
        href="/auth/registration"
        target="_blank"
        rel="noopener"
        class="ml-auto inline-flex items-center gap-1 hover:text-white"
        ><ExternalLink class="h-3 w-3" />Ver la página de registro</a
      >
    </div>
    <noscript>
      <div class="border-t border-white/8 px-6 py-3 text-right">
        <button type="submit" class="k-btn k-btn-primary k-btn-sm">{$_('common.save')}</button>
      </div>
    </noscript>
  </form>
</div>
