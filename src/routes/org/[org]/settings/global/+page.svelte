<script lang="ts">
  import {
    Building2,
    CheckCircle,
    KeyRound,
    LockKeyhole,
    RefreshCw,
    Shield,
  } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  let googleSsoEnabled = false;
  let samlEnabled = false;

  let configError = '';
  let isSaving = false;
  let saveSuccess = false;

  function saveSettings() {
    isSaving = true;
    configError = $_('orgSettings.global.saveNotWired');
    saveSuccess = false;
    setTimeout(() => {
      isSaving = false;
    }, 250);
  }
</script>

<svelte:head>
  <title>{$_('orgSettings.global.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-8">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('orgSettings.global.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('orgSettings.global.description')}</p>
  </section>

  <section class="space-y-4">
    <div>
      <h4 class="text-base font-semibold text-slate-900">{$_('orgSettings.global.authentication')}</h4>
      <p class="mt-1 text-sm text-slate-600">
        {$_('orgSettings.global.authenticationDescription')}
      </p>
    </div>

    <div class="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div class="flex items-start gap-3">
        <Shield class="mt-0.5 h-5 w-5 text-emerald-700" />
        <div>
          <p class="text-sm font-semibold text-emerald-900">{$_('orgSettings.global.localAuthTitle')}</p>
          <p class="mt-1 text-sm text-emerald-800">{$_('orgSettings.global.localAuthDescription')}</p>
        </div>
      </div>
    </div>

    <section class="overflow-hidden rounded-md border border-slate-200 bg-white opacity-75">
      <div class="flex items-start gap-3 px-4 py-4">
        <input
          id="google-sso"
          type="checkbox"
          disabled
          bind:checked={googleSsoEnabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed"
        />
        <div class="flex-1">
          <label
            for="google-sso"
            class="flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <Building2 class="h-4 w-4" />
            GCP Workspace (Google SSO)
            <span
              class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
            >
              {$_('common.comingSoon')}
            </span>
          </label>
          <p class="mt-1 text-sm text-slate-600">{$_('orgSettings.global.googleDescription')}</p>
        </div>
      </div>
    </section>

    <section class="overflow-hidden rounded-md border border-slate-200 bg-white opacity-75">
      <div class="flex items-start gap-3 px-4 py-4">
        <input
          id="saml-enabled"
          type="checkbox"
          disabled
          bind:checked={samlEnabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed"
        />
        <div class="flex-1">
          <label
            for="saml-enabled"
            class="flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <KeyRound class="h-4 w-4" />
            SAML
            <span
              class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
            >
              {$_('common.comingSoon')}
            </span>
          </label>
          <p class="mt-1 text-sm text-slate-600">{$_('orgSettings.global.samlDescription')}</p>
        </div>
      </div>
    </section>

    {#if configError}
      <div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {configError}
      </div>
    {/if}

    {#if saveSuccess}
      <div
        class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        <span class="inline-flex items-center gap-2">
          <CheckCircle class="h-4 w-4" /> {$_('orgSettings.global.saved')}
        </span>
      </div>
    {/if}

    <button
      type="button"
      class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
      on:click={saveSettings}
      disabled={isSaving}
    >
      <RefreshCw class="h-4 w-4 {isSaving ? 'animate-spin' : ''}" />
      {isSaving ? $_('orgSettings.global.saving') : $_('orgSettings.global.save')}
    </button>
  </section>

  <section class="space-y-4">
    <div>
      <h4 class="text-base font-semibold text-slate-900">{$_('orgSettings.global.encryption')}</h4>
      <p class="mt-1 text-sm text-slate-600">{$_('orgSettings.global.encryptionDescription')}</p>
    </div>

    <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-14">
      <div class="flex flex-col items-center justify-center gap-3 text-center">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"
        >
          <LockKeyhole class="h-6 w-6" />
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-900">{$_('orgSettings.global.comingSoon')}</p>
          <p class="mt-1 max-w-md text-sm text-slate-500">
            {$_('orgSettings.global.comingSoonDescription')}
          </p>
        </div>
      </div>
    </div>
  </section>
</div>
