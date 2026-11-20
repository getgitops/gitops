<script lang="ts">
  import { Building2, CheckCircle, KeyRound, RefreshCw, Shield } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { GoogleSsoStatus } from '#modules/auth';

  export let data: { googleSso: GoogleSsoStatus };

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

<div class="global-settings">
  <section class="settings-section-heading">
    <h2>{$_('orgSettings.global.title')}</h2>
    <p>{$_('orgSettings.global.description')}</p>
  </section>

  <section class="auth-section">
    <div>
      <h4 class="text-base font-semibold text-slate-900">
        {$_('orgSettings.global.authentication')}
      </h4>
      <p class="mt-1 text-sm text-slate-600">
        {$_('orgSettings.global.authenticationDescription')}
      </p>
    </div>

    <div class="auth-active-card">
      <div class="flex items-start gap-3">
        <Shield class="mt-0.5 h-5 w-5 text-emerald-700" />
        <div>
          <p class="text-sm font-semibold text-emerald-900">
            {$_('orgSettings.global.localAuthTitle')}
          </p>
          <p class="mt-1 text-sm text-emerald-800">
            {$_('orgSettings.global.localAuthDescription')}
          </p>
        </div>
      </div>
    </div>

    <section
      class="auth-provider-card {data.googleSso.enabled
        ? 'border-emerald-200'
        : 'border-slate-200 opacity-75'}"
    >
      <div class="flex items-start gap-3 px-4 py-4">
        <input
          id="google-sso"
          type="checkbox"
          disabled
          checked={data.googleSso.enabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed"
        />
        <div class="flex-1">
          <label
            for="google-sso"
            class="flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <Building2 class="h-4 w-4" />
            GCP Workspace (Google SSO)
            {#if data.googleSso.enabled}
              <span
                class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
              >
                {$_('orgSettings.global.googleClusterEnabledBadge')}
              </span>
            {:else}
              <span
                class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                {$_('orgSettings.global.googleClusterDisabledBadge')}
              </span>
            {/if}
          </label>
          <p class="mt-1 text-sm text-slate-600">{$_('orgSettings.global.googleDescription')}</p>

          {#if data.googleSso.enabled}
            <div
              class="mt-3 space-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              <p class="font-semibold">{$_('orgSettings.global.googleClusterEnabledTitle')}</p>
              <p>{$_('orgSettings.global.googleClusterEnabled')}</p>
            </div>
          {:else}
            <p class="mt-2 text-xs text-slate-500">
              {$_('orgSettings.global.googleClusterDisabled')}
            </p>
          {/if}
        </div>
      </div>
    </section>

    <section class="auth-provider-card disabled">
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
          <CheckCircle class="h-4 w-4" />
          {$_('orgSettings.global.saved')}
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
</div>

<style>
  .global-settings {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .settings-section-heading h2 {
    color: #ece8ee;
    font-size: 21px;
    font-weight: 580;
  }

  .settings-section-heading p {
    margin-top: 6px;
    color: #7f7983;
    font-size: 15px;
  }

  .auth-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .global-settings :global(h4) {
    color: #ded9df;
    font-size: 16px;
  }

  .global-settings :global(h4 + p) {
    margin-top: 4px;
    color: #7f7983;
    font-size: 14px;
  }

  .auth-active-card,
  .auth-provider-card {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.085);
    border-radius: 10px;
    background: rgb(255 255 255 / 0.025);
  }

  .auth-active-card {
    padding: 16px;
    border-color: rgb(52 211 153 / 0.18);
    background: rgb(52 211 153 / 0.045);
  }

  .auth-provider-card.disabled {
    opacity: 0.72;
  }

  .global-settings :global(.auth-provider-card > div:first-child) {
    padding: 18px !important;
  }

  .global-settings :global(input[type='checkbox']) {
    width: 16px;
    height: 16px;
    accent-color: #f95d11;
  }

  .global-settings :global(.btn-primary) {
    align-self: flex-start;
    min-height: 40px;
    margin-top: 4px;
    border-color: #f95d11;
    background: #f95d11;
  }
</style>
