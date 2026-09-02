<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Cloud,
    KeyRound,
    Languages,
    LockKeyhole,
    Mail,
    Save,
    Shield,
    UserRound,
    Plus,
    Trash2,
    X,
    RotateCcw,
    Copy,
    Check,
  } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';
  import { setLocale, SUPPORTED_LOCALES, locale, type SupportedLocale } from '$lib/i18n';

  export let data: any;
  export let form: any;

  const showApiKeys = false;

  let email = data.user.email || '';
  let createApiKeyModalOpen = false;
  let apiKeyName = '';
  let apiKeyExpiresInDays = '';
  let copiedCreatedKey = false;
  let currentLocale: SupportedLocale = 'es';

  onMount(() => {
    currentLocale = (localStorage.getItem('gitops-locale') as SupportedLocale) ?? 'es';
  });

  $: if (data.user.email !== email && form?.section !== 'profile') {
    email = data.user.email || '';
  }

  function openCreateApiKeyModal() {
    createApiKeyModalOpen = true;
  }

  function closeCreateApiKeyModal() {
    createApiKeyModalOpen = false;
  }

  function formatDateTime(value: string | null) {
    if (!value) {
      return $_('profile.never');
    }

    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function getKeyState(key: any) {
    if (key.revokedAt) {
      return $_('profile.revoked');
    }

    if (key.expiresAt && new Date(key.expiresAt) <= new Date()) {
      return $_('profile.expired');
    }

    return $_('profile.active');
  }

  async function copyCreatedKey() {
    if (!form?.createdKey) {
      return;
    }

    await navigator.clipboard.writeText(form.createdKey);
    copiedCreatedKey = true;
    setTimeout(() => (copiedCreatedKey = false), 2000);
  }

  function handleLocaleChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const lang = select.value as SupportedLocale;
    currentLocale = lang;
    setLocale(lang);
  }
</script>

<svelte:head>
  <title>{$_('profile.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6">
  <section class="overflow-hidden border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
    <div
      class="bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white sm:px-8"
    >
      <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
            {$_('profile.account')}
          </p>
          <h1 class="mt-2 text-3xl font-bold tracking-tight">{$_('profile.title')}</h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {$_('profile.subtitle')}
          </p>
        </div>

      </div>
    </div>

    <div class="grid gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4 sm:px-8">
      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <UserRound class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{$_('profile.username')}</p>
        <p class="mt-1 text-base font-semibold text-slate-900">{data.user.username}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Mail class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{$_('profile.email')}</p>
        <p class="mt-1 text-base font-semibold text-slate-900">{data.user.email || $_('profile.notSet')}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Shield class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{$_('profile.role')}</p>
        <p class="mt-1 text-base font-semibold text-slate-900 capitalize">{data.user.role.name}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Cloud class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{$_('profile.gcp')}</p>
        <p class="mt-1 text-base font-semibold text-slate-900">
          {#if data.gcpConnected}
            {$_('profile.connected')}
          {:else}
            {$_('profile.notConnected')}
          {/if}
        </p>
      </div>
    </div>
  </section>

  {#if form?.message}
    <div
      class="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:rounded-xl"
    >
      {form.message}
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
      <div class="flex items-center gap-3">
        <Mail class="h-5 w-5 text-slate-900" />
        <h2 class="text-lg font-semibold text-slate-900">{$_('profile.accountInformation')}</h2>
      </div>

      <form method="POST" action="?/updateProfile" class="mt-6 space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700">{$_('profile.email')}</label>
          <input
            id="email"
            name="email"
            type="email"
            bind:value={email}
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
            placeholder="you@example.com"
          />
        </div>

        <div
          class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
        >
          <span>{$_('profile.username')}</span>
          <span class="font-medium text-slate-900">{data.user.username}</span>
        </div>

        <div
          class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
        >
          <span>{$_('profile.role')}</span>
          <span class="font-medium text-slate-900 capitalize">{data.user.role.name}</span>
        </div>

        <button
          type="submit"
          class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
        >
          <Save class="h-4 w-4" />
          {$_('profile.saveChanges')}
        </button>
      </form>
    </section>

    <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
      <div class="flex items-center gap-3">
        <LockKeyhole class="h-5 w-5 text-slate-900" />
        <h2 class="text-lg font-semibold text-slate-900">{$_('profile.password')}</h2>
      </div>

      <form method="POST" action="?/updatePassword" class="mt-6 space-y-4">
        <div>
          <label for="currentPassword" class="block text-sm font-medium text-slate-700"
            >{$_('profile.currentPassword')}</label
          >
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          />
        </div>

        <div>
          <label for="newPassword" class="block text-sm font-medium text-slate-700"
            >{$_('profile.newPassword')}</label
          >
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          />
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-slate-700"
            >{$_('profile.confirmPassword')}</label
          >
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          />
        </div>

        <button
          type="submit"
          class="btn-secondary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
        >
          {$_('profile.updatePassword')}
        </button>
      </form>
    </section>
  </div>

  <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
    <div class="flex items-center gap-3">
      <Languages class="h-5 w-5 text-slate-900" />
      <div>
        <h2 class="text-lg font-semibold text-slate-900">{$_('profile.language')}</h2>
        <p class="text-sm text-slate-500">{$_('profile.languageDescription')}</p>
      </div>
    </div>

    <div class="mt-4">
      <select
        value={currentLocale}
        on:change={handleLocaleChange}
        class="field-input rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
        aria-label={$_('profile.language')}
      >
        {#each SUPPORTED_LOCALES as lang}
          <option value={lang}>
            {lang === 'es' ? $_('profile.spanish') : $_('profile.english')}
          </option>
        {/each}
      </select>
    </div>
  </section>

  {#if showApiKeys}
  <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <KeyRound class="h-5 w-5 text-slate-900" />
        <div>
          <h2 class="text-lg font-semibold text-slate-900">{$_('profile.apiKeys')}</h2>
          <p class="text-sm text-slate-500">{$_('profile.apiKeysDescription')}</p>
        </div>
      </div>

      <button
        type="button"
        on:click={openCreateApiKeyModal}
        class="btn-primary inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
      >
        <Plus class="h-4 w-4" />
        {$_('profile.create')}
      </button>
    </div>

    {#if form?.createdKey}
      <div
        class="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-medium">{$_('profile.copyNow')}</p>
            <code class="mt-2 block break-all rounded bg-white px-3 py-2 text-xs text-slate-900"
              >{form.createdKey}</code
            >
          </div>

          <button
            type="button"
            on:click={copyCreatedKey}
            class="btn-ghost inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            title={$_('profile.copy')}
            aria-label={$_('profile.copy')}
          >
            {#if copiedCreatedKey}
              <Check class="h-4 w-4 text-emerald-600" />
              {$_('profile.copied')}
            {:else}
              <Copy class="h-4 w-4" />
              {$_('profile.copy')}
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <div class="mt-6 space-y-3">
      {#if data.apiKeys.length === 0}
        <div
          class="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
        >
          {$_('profile.noApiKeys')}
        </div>
      {:else}
        {#each data.apiKeys as key}
          <div
            class="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="text-sm font-medium text-slate-900">{key.name}</p>
              <p class="mt-1 text-xs text-slate-500">
                {$_('profile.prefix')}: {key.keyPrefix} · {$_('profile.created')} {key.createdAt} · {$_('profile.expires')} {formatDateTime(
                  key.expiresAt,
                )}
              </p>
              <p
                class="mt-1 text-xs font-medium {key.revokedAt
                  ? 'text-rose-700'
                  : 'text-emerald-700'}"
              >
                {$_('profile.status')}: {getKeyState(key)}
                {#if key.revokedAt}
                  · {$_('profile.revoked')} {formatDateTime(key.revokedAt)}
                {/if}
              </p>
            </div>

            <div class="flex items-center gap-2">
              {#if !key.revokedAt}
                <form method="POST" action="?/regenerateApiKey">
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    class="btn-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                  >
                    <RotateCcw class="h-4 w-4" />
                    {$_('profile.regenerate')}
                  </button>
                </form>

                <form method="POST" action="?/revokeApiKey">
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                  >
                    <Trash2 class="h-4 w-4" />
                    {$_('profile.revoke')}
                  </button>
                </form>
              {:else}
                <div
                  class="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"
                >
                  {$_('profile.revokedActionsUnavailable')}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
  {/if}
</div>

{#if showApiKeys && createApiKeyModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeCreateApiKeyModal}
    aria-label={$_('profile.closeCreateApiKeyModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('profile.createApiKey')}
    >
      <div class="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h5 class="text-sm font-semibold text-slate-900">{$_('profile.createApiKey')}</h5>
          <p class="mt-1 text-xs text-slate-500">
            {$_('profile.setNameAndExpiration')}
          </p>
        </div>
        <button
          type="button"
          on:click={closeCreateApiKeyModal}
          class="btn-ghost p-2 rounded-md text-slate-500 hover:text-slate-800 transition-colors"
          aria-label={$_('common.close')}
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form method="POST" action="?/createApiKey" class="space-y-4 px-4 py-4">
        <div>
          <label for="api-key-name" class="block text-sm font-medium text-slate-700">{$_('profile.name')}</label>
          <input
            id="api-key-name"
            name="name"
            type="text"
            bind:value={apiKeyName}
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
            placeholder="Deploy token"
            autocomplete="off"
          />
        </div>

        <div>
          <label for="api-key-expiration" class="block text-sm font-medium text-slate-700"
            >{$_('profile.expiration')}</label
          >
          <select
            id="api-key-expiration"
            name="expiresInDays"
            bind:value={apiKeyExpiresInDays}
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          >
            <option value="">{$_('profile.never')}</option>
            <option value="7">7 {$_('profile.days')}</option>
            <option value="30">30 {$_('profile.days')}</option>
            <option value="90">90 {$_('profile.days')}</option>
            <option value="365">365 {$_('profile.days')}</option>
          </select>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            on:click={closeCreateApiKeyModal}
            class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
          >
            {$_('profile.cancel')}
          </button>
          <button
            type="submit"
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" />
            {$_('profile.createApiKey')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
