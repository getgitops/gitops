<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { Building2, Check, Database, ShieldCheck } from 'lucide-svelte';

  type BootstrapState = {
    repository: boolean;
    administrator: boolean;
    organization: boolean;
    completed: boolean;
  };

  export let data: {
    state: BootstrapState;
    step: 'repository' | 'administrator' | 'organization';
    repository: {
      repositoryUrl: string;
      branch: string;
      authMode: 'none' | 'basic' | 'token';
      username: string | null;
      hasSecret: boolean;
      authorName: string;
      authorEmail: string;
      syncPollSeconds: number;
    } | null;
    limits: { min: number; max: number; default: number };
  };

  const STEPS = [
    { key: 'repository', label: 'Configure repository', icon: Database },
    { key: 'administrator', label: 'Create Cluster Administrator', icon: ShieldCheck },
    { key: 'organization', label: 'Create Organization', icon: Building2 },
  ] as const;

  $: state = data.state;
  $: currentStep = data.step;

  let repositoryUrl = data.repository?.repositoryUrl ?? '';
  let branch = data.repository?.branch ?? 'main';
  let authMode: 'none' | 'basic' | 'token' = data.repository?.authMode ?? 'token';
  let username = data.repository?.username ?? '';
  let secret = '';
  let authorName = data.repository?.authorName ?? 'gitvault-suite';
  let authorEmail = data.repository?.authorEmail ?? 'gitvault-suite@getgitops.local';
  let syncPollSeconds = data.repository?.syncPollSeconds ?? data.limits.default;

  let adminUsername = '';
  let adminEmail = '';
  let adminPassword = '';
  let adminPasswordConfirmation = '';

  let orgName = '';
  let orgSlug = '';
  let orgDescription = '';

  let submitting = false;
  let error = '';

  function isDone(key: string) {
    return state[key as keyof BootstrapState] === true;
  }

  const submitStep =
    (fallbackMessage: string): SubmitFunction =>
    () => {
      error = '';
      submitting = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        submitting = false;

        if (result.type === 'success' || result.type === 'redirect') return;

        error =
          result.type === 'failure' && result.data?.error
            ? String(result.data.error)
            : fallbackMessage;
      };
    };
</script>

<svelte:head>
  <title>Setup - GitVault Suite</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-4 py-12">
  <header class="mb-8">
    <h1 class="text-2xl font-semibold text-slate-900">Cluster setup</h1>
    <p class="mt-2 text-sm text-slate-600">
      Complete these steps to initialize GitVault Suite.
    </p>
  </header>

  <ol class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
    {#each STEPS as step, index}
      <li class="flex flex-1 items-center gap-3">
        <span
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold
            {isDone(step.key)
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : step.key === currentStep
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-400'}"
        >
          {#if isDone(step.key)}
            <Check class="h-4 w-4" />
          {:else}
            {index + 1}
          {/if}
        </span>
        <span
          class="text-sm font-medium {step.key === currentStep
            ? 'text-slate-900'
            : 'text-slate-500'}"
        >
          {step.label}
        </span>
      </li>
    {/each}
  </ol>

  {#if error}
    <div class="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if currentStep === 'repository'}
    <form
      method="POST"
      action="?/configureRepository"
      use:enhance={submitStep('Failed to configure the repository.')}
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-200 px-6 py-4">
        <h2 class="text-base font-semibold text-slate-900">1. Configure repository</h2>
        <p class="mt-1 text-sm text-slate-600">
          GitDB stores all cluster state in this Git repository.
        </p>
      </div>

      <div class="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-repo-url">Repository URL</label>
          <input
            id="bootstrap-repo-url"
            name="repositoryUrl"
            type="text"
            bind:value={repositoryUrl}
            placeholder="https://github.com/org/gitdb-state.git"
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-repo-branch">Branch</label>
          <input
            id="bootstrap-repo-branch"
            name="branch"
            type="text"
            bind:value={branch}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-repo-auth">Authentication</label>
          <select
            id="bootstrap-repo-auth"
            name="authMode"
            bind:value={authMode}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          >
            <option value="token">Token</option>
            <option value="basic">User / Password</option>
            <option value="none">None (SSH key or public repo)</option>
          </select>
        </div>

        {#if authMode !== 'none'}
          <div>
            <label class="block text-sm font-medium text-slate-700" for="bootstrap-repo-username">
              {authMode === 'token' ? 'Username (optional)' : 'Username'}
            </label>
            <input
              id="bootstrap-repo-username"
              name="username"
              type="text"
              autocomplete="off"
              bind:value={username}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="bootstrap-repo-secret">
              {authMode === 'token' ? 'Token' : 'Password'}
            </label>
            <input
              id="bootstrap-repo-secret"
              name="secret"
              type="password"
              autocomplete="new-password"
              bind:value={secret}
              placeholder={data.repository?.hasSecret ? '•••••••• (stored)' : ''}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-author-name">Commit author name</label>
          <input
            id="bootstrap-author-name"
            name="authorName"
            type="text"
            bind:value={authorName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-author-email">Commit author email</label>
          <input
            id="bootstrap-author-email"
            name="authorEmail"
            type="email"
            bind:value={authorEmail}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-sync-poll">Sync poll (seconds)</label>
          <input
            id="bootstrap-sync-poll"
            name="syncPollSeconds"
            type="number"
            min={data.limits.min}
            max={data.limits.max}
            bind:value={syncPollSeconds}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        {#if submitting}
          <span class="text-xs text-slate-500">
            Cloning the repository into .gitdb, this can take a while...
          </span>
        {/if}
        <button
          type="submit"
          disabled={submitting}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          {submitting ? 'Connecting...' : 'Connect and continue'}
        </button>
      </div>
    </form>
  {:else if currentStep === 'administrator'}
    <form
      method="POST"
      action="?/createAdministrator"
      use:enhance={submitStep('Failed to create the cluster administrator.')}
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-200 px-6 py-4">
        <h2 class="text-base font-semibold text-slate-900">2. Create Cluster Administrator</h2>
        <p class="mt-1 text-sm text-slate-600">
          This account gets full access to cluster settings.
        </p>
      </div>

      <div class="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-username">Username</label>
          <input
            id="bootstrap-admin-username"
            name="username"
            type="text"
            autocomplete="username"
            bind:value={adminUsername}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-email">Email</label>
          <input
            id="bootstrap-admin-email"
            name="email"
            type="email"
            autocomplete="email"
            bind:value={adminEmail}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-password">Password</label>
          <input
            id="bootstrap-admin-password"
            name="password"
            type="password"
            autocomplete="new-password"
            bind:value={adminPassword}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-password-confirm">
            Confirm password
          </label>
          <input
            id="bootstrap-admin-password-confirm"
            name="passwordConfirmation"
            type="password"
            autocomplete="new-password"
            bind:value={adminPasswordConfirmation}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>

      <div class="flex justify-end border-t border-slate-200 px-6 py-4">
        <button
          type="submit"
          disabled={submitting}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          {submitting ? 'Creating...' : 'Create administrator'}
        </button>
      </div>
    </form>
  {:else}
    <form
      method="POST"
      action="?/createOrganization"
      use:enhance={submitStep('Failed to create the organization.')}
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-200 px-6 py-4">
        <h2 class="text-base font-semibold text-slate-900">3. Create Organization</h2>
        <p class="mt-1 text-sm text-slate-600">
          Organizations group projects and their members.
        </p>
      </div>

      <div class="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-name">Name</label>
          <input
            id="bootstrap-org-name"
            name="name"
            type="text"
            bind:value={orgName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-slug">Slug (optional)</label>
          <input
            id="bootstrap-org-slug"
            name="slug"
            type="text"
            bind:value={orgSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div class="sm:col-span-2">
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-description">Description</label>
          <textarea
            id="bootstrap-org-description"
            name="description"
            rows="3"
            bind:value={orgDescription}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          ></textarea>
        </div>
      </div>

      <div class="flex justify-end border-t border-slate-200 px-6 py-4">
        <button
          type="submit"
          disabled={submitting}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          {submitting ? 'Creating...' : 'Finish setup'}
        </button>
      </div>
    </form>
  {/if}
</div>
