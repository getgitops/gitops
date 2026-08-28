<script lang="ts">
  import { Check, Copy, KeyRound, Plus, Trash2 } from '@lucide/svelte';
  import { _, locale } from 'svelte-i18n';

  type ApiKeyRow = {
    id: string;
    name: string;
    keyPrefix: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  };

  export let data: { apiKeys: ApiKeyRow[] };
  export let form: { success?: boolean; error?: string; createdKey?: string } | null;

  let createModalOpen = false;
  let name = '';
  let expiresInDays = '';
  let copied = false;

  function openCreateModal() {
    name = '';
    expiresInDays = '';
    createModalOpen = true;
  }

  function closeCreateModal() {
    createModalOpen = false;
  }

  $: if (form?.success && form?.createdKey) {
    createModalOpen = false;
  }

  async function copyToken() {
    if (!form?.createdKey) return;
    await navigator.clipboard.writeText(form.createdKey);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function formatDateTime(value: string | null) {
    if (!value) return $_('projectSettings.serverAccessKeys.never');
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  }

  function keyState(key: ApiKeyRow) {
    if (key.revokedAt) return $_('projectSettings.serverAccessKeys.revoked');
    if (key.expiresAt && new Date(key.expiresAt) <= new Date())
      return $_('projectSettings.serverAccessKeys.expired');
    return $_('projectSettings.serverAccessKeys.active');
  }
</script>

<svelte:head>
  <title>{$_('projectSettings.serverAccessKeys.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <div class="flex items-start justify-between gap-4">
      <div>
        <h3 class="text-xl font-semibold text-slate-900">
          {$_('projectSettings.serverAccessKeys.title')}
        </h3>
        <p class="mt-2 text-sm text-slate-600">
          {$_('projectSettings.serverAccessKeys.descriptionPrefix')} <code
            class="rounded bg-slate-100 px-1.5 py-0.5 text-xs"
            >POST /api/code-report/analyse-result</code
          >.
        </p>
      </div>
      <button
        type="button"
        on:click={openCreateModal}
        class="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Plus class="h-4 w-4" />
        {$_('projectSettings.serverAccessKeys.createKey')}
      </button>
    </div>
  </section>

  {#if form?.error}
    <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{form.error}</p>
  {/if}

  {#if form?.createdKey}
    <div class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="font-medium">{$_('projectSettings.serverAccessKeys.copyTokenNow')}</p>
          <code class="mt-2 block break-all rounded bg-white px-3 py-2 text-xs text-slate-900"
            >{form.createdKey}</code
          >
        </div>
        <button
          type="button"
          on:click={copyToken}
          class="inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          {#if copied}
            <Check class="h-4 w-4 text-emerald-600" />
            {$_('projectSettings.serverAccessKeys.copied')}
          {:else}
            <Copy class="h-4 w-4" />
            {$_('projectSettings.serverAccessKeys.copyToken')}
          {/if}
        </button>
      </div>
    </div>
  {/if}

  <div class="space-y-3">
    {#if data.apiKeys.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"
      >
        <KeyRound class="h-8 w-8 text-slate-400" />
        <p class="text-sm font-medium text-slate-700">{$_('projectSettings.serverAccessKeys.noKeys')}</p>
      </div>
    {:else}
      {#each data.apiKeys as key (key.id)}
        <div
          class="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="text-sm font-medium text-slate-900">{key.name}</p>
            <p class="mt-1 text-xs text-slate-500">
              {$_('projectSettings.serverAccessKeys.prefix')}: {key.keyPrefix} · {$_(
                'projectSettings.serverAccessKeys.created'
              )} {formatDateTime(key.createdAt)} · {$_('projectSettings.serverAccessKeys.expires')} {formatDateTime(
                key.expiresAt,
              )}
            </p>
            <p
              class="mt-1 text-xs font-medium {key.revokedAt
                ? 'text-rose-700'
                : 'text-emerald-700'}"
            >
              {$_('projectSettings.serverAccessKeys.state')}: {keyState(key)}
            </p>
          </div>

          {#if !key.revokedAt}
            <form method="POST" action="?/revoke">
              <input type="hidden" name="keyId" value={key.id} />
              <button
                type="submit"
                class="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 class="h-4 w-4" />
                {$_('projectSettings.serverAccessKeys.revoke')}
              </button>
            </form>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if createModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h3 class="text-lg font-semibold text-slate-900">
        {$_('projectSettings.serverAccessKeys.createServerAccessKeyShort')}
      </h3>

      <form method="POST" action="?/create" class="mt-4 space-y-4">
        <div>
          <label for="key-name" class="block text-sm font-medium text-slate-700">
            {$_('common.name')}
          </label>
          <input
            id="key-name"
            name="name"
            type="text"
            required
            bind:value={name}
            placeholder="CI pipeline"
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label for="key-expiration" class="block text-sm font-medium text-slate-700">
            {$_('projectSettings.serverAccessKeys.expiration')}
          </label>
          <select
            id="key-expiration"
            name="expiresInDays"
            bind:value={expiresInDays}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          >
            <option value="">{$_('projectSettings.serverAccessKeys.never')}</option>
            <option value="7">{$_('projectSettings.serverAccessKeys.days7')}</option>
            <option value="30">{$_('projectSettings.serverAccessKeys.days30')}</option>
            <option value="90">{$_('projectSettings.serverAccessKeys.days90')}</option>
            <option value="365">{$_('projectSettings.serverAccessKeys.days365')}</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            on:click={closeCreateModal}
            class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {$_('projectSettings.serverAccessKeys.cancel')}
          </button>
          <button
            type="submit"
            class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {$_('projectSettings.serverAccessKeys.createKey')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
