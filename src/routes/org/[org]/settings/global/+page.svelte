<script lang="ts">
  import { Building2, CheckCircle, KeyRound, LockKeyhole, RefreshCw, Shield } from '@lucide/svelte';

  let googleSsoEnabled = false;
  let googleClientId = '';
  let googleClientSecret = '';

  let samlEnabled = false;
  let samlEntryPoint = '';
  let samlIssuer = '';
  let samlCert = '';

  let configError = '';
  let isSaving = false;
  let saveSuccess = false;

  function saveSettings() {
    isSaving = true;
    configError = 'Global authentication settings are not wired to a server action yet.';
    saveSuccess = false;
    setTimeout(() => {
      isSaving = false;
    }, 250);
  }
</script>

<svelte:head>
  <title>Global Settings - Settings</title>
</svelte:head>

<div class="space-y-8">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Global Settings</h3>
    <p class="mt-2 text-sm text-slate-600">
      Configure organization-wide authentication methods and security defaults.
    </p>
  </section>

  <section class="space-y-4">
    <div>
      <h4 class="text-base font-semibold text-slate-900">Authentication</h4>
      <p class="mt-1 text-sm text-slate-600">
        Local login is always enabled. Optionally connect GCP Workspace and SAML as additional
        providers.
      </p>
    </div>

    <div class="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div class="flex items-start gap-3">
        <Shield class="mt-0.5 h-5 w-5 text-emerald-700" />
        <div>
          <p class="text-sm font-semibold text-emerald-900">Local authentication: always ON</p>
          <p class="mt-1 text-sm text-emerald-800">
            Username/password access remains available even when external providers are enabled.
          </p>
        </div>
      </div>
    </div>

    <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
        <input
          id="google-sso"
          type="checkbox"
          bind:checked={googleSsoEnabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
        />
        <div class="flex-1">
          <label
            for="google-sso"
            class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <Building2 class="h-4 w-4" />
            GCP Workspace (Google SSO)
          </label>
          <p class="mt-1 text-sm text-slate-600">
            Allow users to authenticate with Google Workspace accounts.
          </p>
        </div>
      </div>

      {#if googleSsoEnabled}
        <div class="space-y-4 bg-slate-50 px-4 py-4">
          <div>
            <label for="google-client-id" class="block text-sm font-medium text-slate-700">
              Google Client ID
            </label>
            <input
              id="google-client-id"
              type="text"
              bind:value={googleClientId}
              class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="123456789-abc.apps.googleusercontent.com"
            />
          </div>

          <div>
            <label for="google-client-secret" class="block text-sm font-medium text-slate-700">
              Google Client Secret
            </label>
            <input
              id="google-client-secret"
              type="password"
              bind:value={googleClientSecret}
              class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="********"
            />
          </div>
        </div>
      {/if}
    </section>

    <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
        <input
          id="saml-enabled"
          type="checkbox"
          bind:checked={samlEnabled}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
        />
        <div class="flex-1">
          <label
            for="saml-enabled"
            class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <KeyRound class="h-4 w-4" />
            SAML
          </label>
          <p class="mt-1 text-sm text-slate-600">
            Connect an enterprise identity provider through SAML.
          </p>
        </div>
      </div>

      {#if samlEnabled}
        <div class="space-y-4 bg-slate-50 px-4 py-4">
          <div>
            <label for="saml-entry" class="block text-sm font-medium text-slate-700">
              SAML Entry Point
            </label>
            <input
              id="saml-entry"
              type="text"
              bind:value={samlEntryPoint}
              class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="https://idp.example.com/sso"
            />
          </div>

          <div>
            <label for="saml-issuer" class="block text-sm font-medium text-slate-700">
              SAML Issuer
            </label>
            <input
              id="saml-issuer"
              type="text"
              bind:value={samlIssuer}
              class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="gitops"
            />
          </div>

          <div>
            <label for="saml-cert" class="block text-sm font-medium text-slate-700">
              SAML Certificate (PEM)
            </label>
            <textarea
              id="saml-cert"
              bind:value={samlCert}
              rows="4"
              class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="-----BEGIN CERTIFICATE-----"
            ></textarea>
          </div>
        </div>
      {/if}
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
          <CheckCircle class="h-4 w-4" /> Global settings saved.
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
      {isSaving ? 'Saving...' : 'Save global settings'}
    </button>
  </section>

  <section class="space-y-4">
    <div>
      <h4 class="text-base font-semibold text-slate-900">Encryption</h4>
      <p class="mt-1 text-sm text-slate-600">
        Organization encryption controls will be managed here.
      </p>
    </div>

    <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-14">
      <div class="flex flex-col items-center justify-center gap-3 text-center">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"
        >
          <LockKeyhole class="h-6 w-6" />
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-900">Coming soon</p>
          <p class="mt-1 max-w-md text-sm text-slate-500">
            Key rotation, encryption policy, and scoped secret protection settings are planned for a
            future release.
          </p>
        </div>
      </div>
    </div>
  </section>
</div>
