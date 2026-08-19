<script lang="ts">
  import {
    Cloud,
    KeyRound,
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
  } from 'lucide-svelte';

  export let data: any;
  export let form: any;

  let email = data.user.email || '';
  let createApiKeyModalOpen = false;
  let apiKeyName = '';
  let apiKeyExpiresInDays = '';
  let copiedCreatedKey = false;

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
      return 'Never';
    }

    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function getKeyState(key: any) {
    if (key.revokedAt) {
      return 'Revoked';
    }

    if (key.expiresAt && new Date(key.expiresAt) <= new Date()) {
      return 'Expired';
    }

    return 'Active';
  }

  async function copyCreatedKey() {
    if (!form?.createdKey) {
      return;
    }

    await navigator.clipboard.writeText(form.createdKey);
    copiedCreatedKey = true;
    setTimeout(() => (copiedCreatedKey = false), 2000);
  }
</script>

<svelte:head>
  <title>Profile - GitVault Suite</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6">
  <section class="overflow-hidden border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
    <div class="bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white sm:px-8">
      <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">Account</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight">Profile</h1>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        Manage your identity, password and API access from one place.
      </p>
    </div>

    <div class="grid gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4 sm:px-8">
      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <UserRound class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Username</p>
        <p class="mt-1 text-base font-semibold text-slate-900">{data.user.username}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Mail class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p>
        <p class="mt-1 text-base font-semibold text-slate-900">{data.user.email || 'Not set'}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Shield class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Role</p>
        <p class="mt-1 text-base font-semibold text-slate-900 capitalize">{data.user.role.name}</p>
      </div>

      <div class="border border-slate-200 bg-slate-50 p-4 sm:rounded-xl">
        <Cloud class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">GCP</p>
        <p class="mt-1 text-base font-semibold text-slate-900">
          {#if data.gcpConnected}
            Connected
          {:else}
            Not connected
          {/if}
        </p>
      </div>
    </div>
  </section>

  {#if form?.message}
    <div class="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:rounded-xl">
      {form.message}
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
      <div class="flex items-center gap-3">
        <Mail class="h-5 w-5 text-slate-900" />
        <h2 class="text-lg font-semibold text-slate-900">Account information</h2>
      </div>

      <form method="POST" action="?/updateProfile" class="mt-6 space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            bind:value={email}
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
            placeholder="you@example.com"
          />
        </div>

        <div class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>Username</span>
          <span class="font-medium text-slate-900">{data.user.username}</span>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>Role</span>
          <span class="font-medium text-slate-900 capitalize">{data.user.role.name}</span>
        </div>

        <button
          type="submit"
          class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
        >
          <Save class="h-4 w-4" />
          Save changes
        </button>
      </form>
    </section>

    <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
      <div class="flex items-center gap-3">
        <LockKeyhole class="h-5 w-5 text-slate-900" />
        <h2 class="text-lg font-semibold text-slate-900">Password</h2>
      </div>

      <form method="POST" action="?/updatePassword" class="mt-6 space-y-4">
        <div>
          <label for="currentPassword" class="block text-sm font-medium text-slate-700">Current password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          />
        </div>

        <div>
          <label for="newPassword" class="block text-sm font-medium text-slate-700">New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          />
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-slate-700">Confirm password</label>
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
          Update password
        </button>
      </form>
    </section>
  </div>

  <section class="border border-slate-200 bg-white p-6 shadow-sm sm:rounded-2xl">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <KeyRound class="h-5 w-5 text-slate-900" />
        <div>
          <h2 class="text-lg font-semibold text-slate-900">API Keys</h2>
          <p class="text-sm text-slate-500">Create and revoke keys for future API access.</p>
        </div>
      </div>

      <button
        type="button"
        on:click={openCreateApiKeyModal}
        class="btn-primary inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
      >
        <Plus class="h-4 w-4" />
        Create
      </button>
    </div>

    {#if form?.createdKey}
      <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-medium">Copy this token now. It will not be shown again.</p>
            <code class="mt-2 block break-all rounded bg-white px-3 py-2 text-xs text-slate-900">{form.createdKey}</code>
          </div>

          <button
            type="button"
            on:click={copyCreatedKey}
            class="btn-ghost inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            title="Copy API key"
            aria-label="Copy API key"
          >
            {#if copiedCreatedKey}
              <Check class="h-4 w-4 text-emerald-600" />
              Copied
            {:else}
              <Copy class="h-4 w-4" />
              Copy
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <div class="mt-6 space-y-3">
      {#if data.apiKeys.length === 0}
        <div class="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No API keys created yet.
        </div>
      {:else}
        {#each data.apiKeys as key}
          <div class="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium text-slate-900">{key.name}</p>
              <p class="mt-1 text-xs text-slate-500">
                Prefix: {key.keyPrefix} · Created {key.createdAt} · Expires {formatDateTime(key.expiresAt)}
              </p>
              <p class="mt-1 text-xs font-medium {key.revokedAt ? 'text-rose-700' : 'text-emerald-700'}">
                Status: {getKeyState(key)}
                {#if key.revokedAt}
                  · Revoked {formatDateTime(key.revokedAt)}
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
                    Regenerate
                  </button>
                </form>

                <form method="POST" action="?/revokeApiKey">
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                  >
                    <Trash2 class="h-4 w-4" />
                    Revoke
                  </button>
                </form>
              {:else}
                <div class="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  Actions unavailable for revoked keys.
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

{#if createApiKeyModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeCreateApiKeyModal}
    aria-label="Close create api key modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Create API key modal">
      <div class="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h5 class="text-sm font-semibold text-slate-900">Create API key</h5>
          <p class="mt-1 text-xs text-slate-500">Set a name and an expiration before creating it.</p>
        </div>
        <button
          type="button"
          on:click={closeCreateApiKeyModal}
          class="btn-ghost p-2 rounded-md text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="Close modal"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form method="POST" action="?/createApiKey" class="space-y-4 px-4 py-4">
        <div>
          <label for="api-key-name" class="block text-sm font-medium text-slate-700">Name</label>
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
          <label for="api-key-expiration" class="block text-sm font-medium text-slate-700">Expiration</label>
          <select
            id="api-key-expiration"
            name="expiresInDays"
            bind:value={apiKeyExpiresInDays}
            class="field-input mt-2 w-full rounded-md border bg-white px-4 py-2.5 text-sm outline-none transition"
          >
            <option value="">Never</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
          </select>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            on:click={closeCreateApiKeyModal}
            class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" />
            Create API key
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}