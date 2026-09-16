<script lang="ts">
  import { page } from '$app/stores';
  import {
    Braces,
    FileJson,
    Hash,
    Mail,
    MessageCircle,
    Pencil,
    Plus,
    Trash2,
    Webhook,
    X,
  } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type TargetId = 'mail' | 'slack' | 'google-chat' | 'http';
  type Template = {
    id: string;
    provider: TargetId;
    name: string;
    slug: string;
    content: string;
    recipients: string[];
    system: boolean;
  };

  export let data: { templates: Template[]; canUpdate: boolean };
  export let form: { success?: boolean; error?: string } | null;

  const targets = [
    { id: 'mail' as const, name: 'Email', icon: Mail },
    { id: 'slack' as const, name: 'Slack', icon: Hash },
    { id: 'google-chat' as const, name: 'Google Chat', icon: MessageCircle },
    { id: 'http' as const, name: 'HTTP', icon: Webhook },
  ];
  const templateVariables = ['{{rule.name}}', '{{event.name}}', '{{event.payload}}'];
  const requestedTarget = $page?.url?.searchParams?.get('target');
  let selectedTarget: TargetId = targets.some((target) => target.id === requestedTarget)
    ? (requestedTarget as TargetId)
    : 'mail';
  let modalOpen = false;
  let editing: Template | null = null;
  let name = '';
  let content = '';
  let recipients = '';

  $: filteredTemplates = data.templates.filter((template) => template.provider === selectedTarget);
  $: selectedDefinition = targets.find((target) => target.id === selectedTarget)!;

  function openCreate() {
    editing = null;
    name = '';
    content = '';
    recipients = '';
    modalOpen = true;
  }

  function openEdit(template: Template) {
    editing = template;
    name = template.name;
    content = template.content;
    recipients = template.recipients.join(', ');
    modalOpen = true;
  }

  function selectTarget(id: TargetId) {
    selectedTarget = id;
    modalOpen = false;
  }
</script>

<svelte:head><title>{$_('projectSettings.notifications.templates.title')}</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 class="text-xl font-semibold text-slate-900">
        {$_('projectSettings.notifications.templates.title')}
      </h2>
      <p class="mt-1 text-sm text-slate-600">
        {$_('projectSettings.notifications.templates.description')}
      </p>
    </div>
    {#if data.canUpdate}
      <button
        type="button"
        on:click={openCreate}
        class="btn-primary inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
      >
        <Plus class="h-4 w-4" />
        {$_('projectSettings.notifications.templates.newTemplate')}
      </button>
    {/if}
  </div>

  {#if form?.error}<p
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {form.error}
    </p>{/if}

  <div class="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
    <aside class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1">
      {#each targets as target}
        <button
          type="button"
          on:click={() => selectTarget(target.id)}
          class="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border p-3 transition {selectedTarget ===
          target.id
            ? 'border-slate-900 bg-slate-50 text-slate-950 ring-1 ring-slate-900'
            : 'border-slate-200 text-slate-600 hover:border-slate-400'}"
        >
          <svelte:component this={target.icon} class="h-6 w-6" />
          <span class="text-sm font-semibold">{target.name}</span>
          <span class="text-xs text-slate-400"
            >{data.templates.filter((template) => template.provider === target.id).length}</span
          >
        </button>
      {/each}
    </aside>

    <section class="min-w-0 space-y-3">
      <div class="flex items-center gap-3 pb-2">
        <svelte:component this={selectedDefinition.icon} class="h-5 w-5 text-slate-600" />
        <h3 class="text-base font-semibold text-slate-900">{selectedDefinition.name}</h3>
      </div>

      {#each filteredTemplates as template (template.id)}
        <article class="rounded-md border border-slate-200 bg-white p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-semibold text-slate-900">{template.name}</h4>
                {#if template.system}<span
                    class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500"
                    >{$_('projectSettings.notifications.templates.default')}</span
                  >{/if}
              </div>
              <p class="mt-1 font-mono text-xs text-slate-500">{template.slug}</p>
            </div>
            {#if data.canUpdate}
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  on:click={() => openEdit(template)}
                  title={$_('common.edit')}
                  class="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  ><Pencil class="h-4 w-4" /></button
                >
                {#if !template.system}<form method="POST" action="?/delete">
                    <input type="hidden" name="id" value={template.id} /><button
                      type="submit"
                      title={$_('common.delete')}
                      class="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                      ><Trash2 class="h-4 w-4" /></button
                    >
                  </form>{/if}
              </div>
            {/if}
          </div>
          <pre
            class="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{template.content}</pre>
          {#if template.provider === 'mail'}
            <p class="mt-3 break-all text-xs text-slate-500">
              <span class="font-semibold text-slate-700"
                >{$_('projectSettings.notifications.templates.defaultRecipients')}:</span
              >
              {template.recipients.length
                ? template.recipients.join(', ')
                : $_('projectSettings.notifications.templates.noDefaultRecipients')}
            </p>
          {/if}
        </article>
      {/each}
    </section>
  </div>
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
    <div class="w-full max-w-3xl rounded-md bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 class="font-semibold text-slate-900">
            {editing
              ? $_('projectSettings.notifications.templates.editTemplate')
              : $_('projectSettings.notifications.templates.newTemplate')}
          </h3>
          <p class="mt-1 text-sm text-slate-500">{selectedDefinition.name}</p>
        </div>
        <button
          type="button"
          on:click={() => (modalOpen = false)}
          title={$_('common.close')}
          class="p-1 text-slate-500"><X class="h-5 w-5" /></button
        >
      </div>
      <form method="POST" action={editing ? '?/update' : '?/create'} class="space-y-4 p-5">
        {#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
        <input type="hidden" name="provider" value={selectedTarget} />
        <div>
          <label for="template-name" class="block text-sm font-medium text-slate-700"
            >{$_('common.name')}</label
          ><input
            id="template-name"
            name="name"
            required
            bind:value={name}
            disabled={editing?.system}
            class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>
        {#if selectedTarget === 'mail'}
          <div>
            <label for="template-recipients" class="block text-sm font-medium text-slate-700">
              {$_('projectSettings.notifications.templates.defaultRecipients')}
            </label>
            <input
              id="template-recipients"
              name="recipients"
              type="text"
              bind:value={recipients}
              class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="ops@example.com, owner@example.com"
            />
            <p class="mt-1 text-xs text-slate-500">
              {$_('projectSettings.notifications.templates.defaultRecipientsHint')}
            </p>
          </div>
        {/if}
        <div>
          <label for="template-content" class="block text-sm font-medium text-slate-700"
            >{$_('projectSettings.notifications.templates.content')}</label
          ><textarea
            id="template-content"
            name="content"
            required
            rows="14"
            bind:value={content}
            class="field-input mt-1 w-full resize-y rounded-md border px-3 py-2 font-mono text-sm"
          ></textarea>
        </div>
        <div
          class="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
        >
          <Braces class="h-4 w-4 shrink-0" /><span
            >{$_('projectSettings.notifications.templates.variables')}: {#each templateVariables as variable, index}<code
                >{variable}</code
              >{index < templateVariables.length - 1 ? ', ' : ''}{/each}</span
          >
        </div>
        {#if selectedTarget === 'http'}<div
            class="inline-flex items-center gap-2 text-xs text-amber-700"
          >
            <FileJson class="h-4 w-4" />{$_('projectSettings.notifications.templates.validJson')}
          </div>{/if}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            on:click={() => (modalOpen = false)}
            class="btn-secondary rounded-md px-4 py-2 text-sm">{$_('common.cancel')}</button
          ><button type="submit" class="btn-primary rounded-md px-4 py-2 text-sm"
            >{editing ? $_('common.save') : $_('common.create')}</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}
