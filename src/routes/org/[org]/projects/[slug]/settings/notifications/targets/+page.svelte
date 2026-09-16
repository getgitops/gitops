<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { page } from '$app/stores';
  import {
    CheckCircle2,
    Eye,
    EyeOff,
    Hash,
    Mail,
    MessageCircle,
    Save,
    ShieldCheck,
    ExternalLink,
    Webhook,
  } from '@lucide/svelte';
  import { _ } from '$lib/i18n';
  import Dropdown from '$lib/components/Dropdown.svelte';

  type TargetId = 'mail' | 'slack' | 'google-chat' | 'http';
  type Target = {
    id: TargetId;
    configurable: boolean;
    configured: boolean;
    hasCredential: boolean;
    credential: string | null;
    enabled: boolean;
    defaultTemplateId: string | null;
  };

  type TemplateOption = { id: string; provider: TargetId; name: string; slug: string };

  export let data: { targets: Target[]; templates: TemplateOption[]; canUpdate: boolean };
  export let form: { success?: boolean; provider?: string; error?: string } | null;

  const definitions = [
    { id: 'slack' as const, name: 'Slack', icon: Hash, soon: false },
    { id: 'google-chat' as const, name: 'Google Chat', icon: MessageCircle, soon: false },
    { id: 'mail' as const, name: 'Email', icon: Mail, soon: false },
    { id: 'http' as const, name: 'HTTP', icon: Webhook, soon: true },
  ];

  let selectedId: TargetId = 'slack';
  let enabled = data.targets.find((target) => target.id === selectedId)?.enabled ?? true;
  let credential = data.targets.find((target) => target.id === selectedId)?.credential ?? '';
  let credentialVisible = false;
  let defaultTemplateId =
    data.targets.find((target) => target.id === selectedId)?.defaultTemplateId ??
    data.templates.find((template) => template.provider === selectedId)?.id ??
    '';
  let submitting = false;
  $: selected = data.targets.find((target) => target.id === selectedId);
  $: selectedDefinition = definitions.find((target) => target.id === selectedId)!;
  $: targetTemplates = data.templates.filter((template) => template.provider === selectedId);

  const submit: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  function selectTarget(id: TargetId) {
    selectedId = id;
    const target = data.targets.find((item) => item.id === id);
    enabled = target?.enabled ?? true;
    defaultTemplateId =
      target?.defaultTemplateId ??
      data.templates.find((template) => template.provider === id)?.id ??
      '';
    credential = target?.credential ?? '';
    credentialVisible = false;
  }
</script>

<svelte:head><title>{$_('projectSettings.notifications.targets.title')}</title></svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-xl font-semibold text-slate-900">
      {$_('projectSettings.notifications.targets.title')}
    </h2>
    <p class="mt-1 text-sm text-slate-600">
      {$_('projectSettings.notifications.targets.description')}
    </p>
  </div>

  {#if form?.error}
    <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {form.error}
    </p>
  {:else if form?.success}
    <p
      class="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <CheckCircle2 class="h-4 w-4" />
      {$_('projectSettings.notifications.targets.saved')}
    </p>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
    <aside
      class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1"
      aria-label={$_('projectSettings.notifications.targets.title')}
    >
      {#each definitions as definition}
        {@const target = data.targets.find((item) => item.id === definition.id)}
        <button
          type="button"
          on:click={() => selectTarget(definition.id)}
          class="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-md border p-3 text-center transition {selectedId ===
          definition.id
            ? 'border-slate-900 bg-slate-50 text-slate-950 ring-1 ring-slate-900'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}"
        >
          <svelte:component this={definition.icon} class="h-6 w-6" />
          <span class="text-sm font-semibold">{definition.name}</span>
          {#if definition.soon}
            <span
              class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500"
            >
              {$_('projectSettings.notifications.soon')}
            </span>
          {:else if target?.configured}
            <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              {$_('projectSettings.notifications.targets.configured')}
            </span>
          {/if}
        </button>
      {/each}
    </aside>

    <section class="min-w-0 rounded-md border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex items-start gap-3 border-b border-slate-200 pb-5">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700"
        >
          <svelte:component this={selectedDefinition.icon} class="h-5 w-5" />
        </div>
        <div>
          <h3 class="text-base font-semibold text-slate-950">{selectedDefinition.name}</h3>
          <p class="mt-1 text-sm text-slate-500">
            {selectedId === 'mail'
              ? $_('projectSettings.notifications.targets.mailDescription')
              : selected?.configurable
                ? $_('projectSettings.notifications.targets.configureDescription')
                : $_('projectSettings.notifications.targets.comingSoonDescription')}
          </p>
        </div>
      </div>

      {#if selected?.configurable}
        <form method="POST" action="?/save" use:enhance={submit} class="mt-5 space-y-5">
          <input type="hidden" name="provider" value={selectedId} />

          <div>
            <label for="target-credential" class="block text-sm font-medium text-slate-700">
              {selectedId === 'google-chat'
                ? $_('projectSettings.notifications.targets.webhookUrl')
                : $_('projectSettings.notifications.targets.token')}
            </label>
            <div class="relative mt-1">
              <input
                id="target-credential"
                name="credential"
                type={credentialVisible ? 'text' : 'password'}
                bind:value={credential}
                required={!selected.hasCredential}
                disabled={!data.canUpdate}
                autocomplete="new-password"
                class="field-input w-full rounded-md border py-2 pl-3 pr-11 text-sm"
                placeholder={selected.hasCredential
                  ? $_('projectSettings.notifications.targets.credentialConfigured')
                  : selectedId === 'google-chat'
                    ? 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...'
                    : $_('projectSettings.notifications.targets.tokenPlaceholder')}
              />
              <button
                type="button"
                on:click={() => (credentialVisible = !credentialVisible)}
                disabled={!credential}
                title={credentialVisible
                  ? $_('projectSettings.notifications.targets.hideCredential')
                  : $_('projectSettings.notifications.targets.showCredential')}
                class="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {#if credentialVisible}
                  <EyeOff class="h-4 w-4" />
                {:else}
                  <Eye class="h-4 w-4" />
                {/if}
              </button>
            </div>
            <p class="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck class="h-3.5 w-3.5" />
              {$_('projectSettings.notifications.targets.credentialHint')}
            </p>
          </div>

          <label class="flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
            <span>
              <span class="block text-sm font-medium text-slate-800">
                {$_('projectSettings.notifications.targets.enabled')}
              </span>
              <span class="mt-0.5 block text-xs text-slate-500">
                {$_('projectSettings.notifications.targets.enabledDescription')}
              </span>
            </span>
            <span class="relative inline-flex shrink-0 items-center">
              <input
                type="checkbox"
                name="enabled"
                bind:checked={enabled}
                disabled={!data.canUpdate}
                class="peer sr-only"
              />
              <span
                class="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-disabled:opacity-50"
              ></span>
              <span
                class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
              ></span>
            </span>
          </label>

          {#if data.canUpdate}
            <div class="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
              >
                <Save class="h-4 w-4" />
                {submitting ? $_('common.saving') : $_('common.save')}
              </button>
            </div>
          {/if}
        </form>
      {:else if selectedId === 'http'}
        <div class="flex min-h-56 flex-col items-center justify-center text-center">
          <svelte:component this={selectedDefinition.icon} class="h-8 w-8 text-slate-300" />
          <p class="mt-3 text-sm font-medium text-slate-700">
            {$_('projectSettings.notifications.targets.comingSoon')}
          </p>
        </div>
      {/if}

      <div class="mt-6 border-t border-slate-200 pt-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h4 class="text-sm font-semibold text-slate-900">
              {$_('projectSettings.notifications.targets.defaultTemplate')}
            </h4>
            <p class="mt-1 text-xs text-slate-500">
              {$_('projectSettings.notifications.targets.defaultTemplateDescription')}
            </p>
          </div>
          <a
            href={`${($page?.url?.pathname ?? '').replace(/\/targets$/, '/templates')}?target=${selectedId}`}
            class="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-950"
          >
            {$_('projectSettings.notifications.targets.manageTemplates')}
            <ExternalLink class="h-3.5 w-3.5" />
          </a>
        </div>
        <form
          method="POST"
          action="?/setDefaultTemplate"
          class="mt-3 flex flex-col gap-3 sm:flex-row"
        >
          <input type="hidden" name="provider" value={selectedId} />
          <input type="hidden" name="templateId" value={defaultTemplateId} />
          <div class="min-w-0 flex-1">
            <Dropdown
              options={targetTemplates.map((template) => ({
                id: template.id,
                name: template.name,
              }))}
              value={defaultTemplateId}
              fullWidth
              disabled={!data.canUpdate}
              ariaLabel={$_('projectSettings.notifications.targets.defaultTemplate')}
              on:change={(event) => (defaultTemplateId = event.detail.id)}
            />
          </div>
          {#if data.canUpdate}
            <button
              type="submit"
              class="btn-secondary shrink-0 rounded-md px-4 py-2 text-sm font-medium"
            >
              {$_('common.save')}
            </button>
          {/if}
        </form>
      </div>
    </section>
  </div>
</div>
