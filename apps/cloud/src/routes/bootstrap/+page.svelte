<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { Building2, Check, ShieldCheck } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type BootstrapState = {
    administrator: boolean;
    organization: boolean;
    completed: boolean;
  };

  export let data: {
    state: BootstrapState;
    step: 'administrator' | 'organization';
  };

  $: STEPS = [
    { key: 'administrator', label: $_('bootstrap.stepAdministrator'), icon: ShieldCheck },
    { key: 'organization', label: $_('bootstrap.stepOrganization'), icon: Building2 },
  ] as const;

  $: state = data.state;
  $: currentStep = data.step;

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
  <title>{$_('bootstrap.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-4 py-12">
  <header class="mb-8">
    <h1 class="text-2xl font-semibold text-slate-900">{$_('bootstrap.title')}</h1>
    <p class="mt-2 text-sm text-slate-600">
      {$_('bootstrap.subtitle')}
    </p>
  </header>

  <ol class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
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

  {#if currentStep === 'administrator'}
    <form
      method="POST"
      action="?/createAdministrator"
      use:enhance={submitStep($_('bootstrap.createAdministratorFailed'))}
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-200 px-6 py-4">
        <h2 class="text-base font-semibold text-slate-900">{$_('bootstrap.administratorCardTitle')}</h2>
        <p class="mt-1 text-sm text-slate-600">
          {$_('bootstrap.administratorCardDescription')}
        </p>
      </div>

      <div class="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-username">
            {$_('common.username')}
          </label>
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
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-email">
            {$_('common.email')}
          </label>
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
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-admin-password">
            {$_('common.password')}
          </label>
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
          <label
            class="block text-sm font-medium text-slate-700"
            for="bootstrap-admin-password-confirm"
          >
            {$_('common.confirmPassword')}
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
          {submitting ? $_('bootstrap.creating') : $_('bootstrap.createAdministrator')}
        </button>
      </div>
    </form>
  {:else}
    <form
      method="POST"
      action="?/createOrganization"
      use:enhance={submitStep($_('bootstrap.createOrganizationFailed'))}
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-200 px-6 py-4">
        <h2 class="text-base font-semibold text-slate-900">{$_('bootstrap.organizationCardTitle')}</h2>
        <p class="mt-1 text-sm text-slate-600">
          {$_('bootstrap.organizationCardDescription')}
        </p>
      </div>

      <div class="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-name">
            {$_('common.name')}
          </label>
          <input
            id="bootstrap-org-name"
            name="name"
            type="text"
            bind:value={orgName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-slug">
            {$_('bootstrap.slugOptional')}
          </label>
          <input
            id="bootstrap-org-slug"
            name="slug"
            type="text"
            bind:value={orgSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div class="sm:col-span-2">
          <label class="block text-sm font-medium text-slate-700" for="bootstrap-org-description">
            {$_('common.description')}
          </label>
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
          {submitting ? $_('bootstrap.creating') : $_('bootstrap.finishSetup')}
        </button>
      </div>
    </form>
  {/if}
</div>
