<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    ChevronDown,
    ChevronRight,
    Cloud,
    Database,
    LoaderCircle,
    Pencil,
    PlugZap,
    Plus,
    Power,
    Trash2,
  } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import BackendFormModal from './BackendFormModal.svelte';
  import BackendProjects from './BackendProjects.svelte';
  import type { BackendView, ProjectOption } from './types';

  type Props = {
    data: {
      backends: BackendView[];
      projects: ProjectOption[];
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
      canTest: boolean;
    };
  };
  let { data }: Props = $props();

  let formOpen = $state(false);
  let formTarget = $state<BackendView | null>(null);
  let deleteOpen = $state(false);
  let deleteTarget = $state<BackendView | null>(null);
  let deleteConfirm = $state('');
  let busy = $state<string | null>(null);
  let expanded = $state<Record<string, boolean>>({});

  const location = (backend: BackendView) =>
    `${backend.provider === 'gcs' ? 'gs' : 's3'}://${backend.bucket}${backend.prefix ? `/${backend.prefix}` : ''}`;

  function errorMessage(code: unknown) {
    const key = `stateIac.errors.${String(code ?? '')}`;
    const text = code ? $_(key) : key;
    return text === key ? $_('stateIac.backends.actionFailed') : text;
  }

  function openCreate() {
    formTarget = null;
    formOpen = true;
  }

  function openEdit(backend: BackendView) {
    formTarget = backend;
    formOpen = true;
  }

  function openDelete(event: MouseEvent, backend: BackendView) {
    event.preventDefault();
    deleteTarget = backend;
    deleteConfirm = '';
    deleteOpen = true;
  }

  const action =
    (key: string, onSuccess: (data: Record<string, unknown> | undefined) => void): SubmitFunction =>
    () => {
      busy = key;
      return async ({ result }) => {
        busy = null;
        if (result.type === 'success') {
          onSuccess(result.data);
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(errorMessage(result.data?.error));
        } else {
          toast.error($_('stateIac.backends.actionFailed'));
        }
      };
    };

  const test = (backend: BackendView) =>
    action(`test:${backend.id}`, (result) => {
      const outcome = result?.test as
        | { ok: true; layout: string; projects: number; stacks: number }
        | { ok: false; error: string }
        | undefined;
      if (outcome?.ok) {
        toast.success(
          $_('stateIac.backends.testOk', {
            values: {
              layout: $_(`stateIac.layouts.${outcome.layout}`),
              projects: outcome.projects,
              stacks: outcome.stacks,
            },
          }),
        );
      } else {
        toast.error(
          $_('stateIac.backends.testFailed', {
            values: { reason: errorMessage(outcome && !outcome.ok ? outcome.error : null) },
          }),
        );
      }
    });

  const toggle = (backend: BackendView) =>
    action(`toggle:${backend.id}`, () =>
      toast.success(
        backend.enabled
          ? $_('stateIac.backends.disabledToast')
          : $_('stateIac.backends.enabledToast'),
      ),
    );

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) {
      cancel();
      return;
    }
    busy = 'delete';
    return async ({ result }) => {
      busy = null;
      if (result.type === 'success') {
        deleteOpen = false;
        toast.success($_('stateIac.backends.deleted'));
        await invalidateAll();
      } else if (result.type === 'failure') {
        toast.error(errorMessage(result.data?.error));
      } else {
        toast.error($_('stateIac.backends.actionFailed'));
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('stateIac.settings.title')} · GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white">{$_('stateIac.settings.title')}</h1>
      <p class="mt-1 max-w-2xl text-sm text-fg-muted">{$_('stateIac.settings.description')}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if data.canCreate}
        <button type="button" class="k-btn k-btn-primary" onclick={openCreate}>
          <Plus class="h-4 w-4" />
          {$_('stateIac.backends.create')}
        </button>
      {/if}
    </div>
  </header>

  {#if data.backends.length === 0}
    <div class="k-card border-dashed px-6 py-10 text-center" data-testid="state-backends-empty">
      <Database class="mx-auto h-8 w-8 text-fg-subtle" />
      <p class="mt-3 text-sm font-medium text-fg">{$_('stateIac.backends.emptyTitle')}</p>
      <p class="mt-1 text-sm text-fg-muted">{$_('stateIac.backends.emptyDescription')}</p>
    </div>
  {:else}
    <ul class="space-y-3" data-testid="state-backends">
      {#each data.backends as backend (backend.id)}
        <li class="k-card overflow-hidden" data-backend-id={backend.id}>
          <div class="flex flex-wrap items-start gap-3 p-4">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg {backend.enabled
                ? 'bg-brand-500/12 text-brand-400'
                : 'bg-white/5 text-fg-subtle'}"><Cloud class="h-4 w-4" /></span
            >
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {backend.name}
                <span class="k-badge h-5 px-2 text-[10px]"
                  >{$_(`stateIac.providers.${backend.provider}`)}</span
                >
                <span class="k-badge h-5 px-2 text-[10px]"
                  >{$_(`stateIac.auth.${backend.auth}`)}</span
                >
                {#if !backend.enabled}
                  <span class="k-badge h-5 px-2 text-[10px]"
                    >{$_('stateIac.backends.disabled')}</span
                  >
                {/if}
              </p>
              <p class="mt-0.5 truncate font-mono text-xs text-fg-subtle">{location(backend)}</p>
              {#if backend.endpoint}
                <p class="mt-0.5 truncate font-mono text-xs text-fg-subtle">{backend.endpoint}</p>
              {/if}
              {#if backend.lastError}
                <p class="mt-1 text-xs text-red-300" data-testid="backend-last-error">
                  {$_('stateIac.backends.lastError', {
                    values: { error: errorMessage(backend.lastError) },
                  })}
                </p>
              {/if}
            </div>

            <div class="flex items-center gap-1">
              {#if data.canTest}
                <form method="POST" action="?/testBackend" use:enhance={test(backend)}>
                  <input type="hidden" name="backendId" value={backend.id} />
                  <button
                    type="submit"
                    class="k-btn k-btn-secondary k-btn-sm"
                    disabled={busy !== null}
                    data-testid="backend-test"
                  >
                    {#if busy === `test:${backend.id}`}<LoaderCircle
                        class="h-4 w-4 animate-spin"
                      />{:else}<PlugZap class="h-4 w-4" />{/if}
                    {$_('stateIac.backends.test')}
                  </button>
                </form>
              {/if}
              {#if data.canUpdate}
                <form method="POST" action="?/toggleBackend" use:enhance={toggle(backend)}>
                  <input type="hidden" name="backendId" value={backend.id} />
                  <input type="hidden" name="enabled" value={backend.enabled ? 'false' : 'true'} />
                  <button
                    type="submit"
                    class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                    title={backend.enabled
                      ? $_('stateIac.backends.disable')
                      : $_('stateIac.backends.enable')}
                    aria-label="{backend.enabled
                      ? $_('stateIac.backends.disable')
                      : $_('stateIac.backends.enable')}: {backend.name}"
                    disabled={busy !== null}
                  >
                    <Power class="h-4 w-4" />
                  </button>
                </form>
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                  title={$_('stateIac.backends.edit')}
                  aria-label="{$_('stateIac.backends.edit')}: {backend.name}"
                  onclick={() => openEdit(backend)}
                >
                  <Pencil class="h-4 w-4" />
                </button>
              {/if}
              {#if data.canDelete}
                <form method="POST" action="?/deleteBackend">
                  <input type="hidden" name="backendId" value={backend.id} />
                  <button
                    type="submit"
                    class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                    title={$_('stateIac.backends.delete')}
                    aria-label="{$_('stateIac.backends.delete')}: {backend.name}"
                    disabled={busy !== null}
                    onclick={(event) => openDelete(event, backend)}
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </form>
              {/if}
            </div>
          </div>

          <div class="border-t border-white/5">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-fg-muted hover:text-fg"
              aria-expanded={Boolean(expanded[backend.id])}
              onclick={() => (expanded[backend.id] = !expanded[backend.id])}
              data-testid="backend-projects-toggle"
            >
              {#if expanded[backend.id]}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight
                  class="h-4 w-4"
                />{/if}
              {$_('stateIac.projects.toggle')}
            </button>
            {#if expanded[backend.id]}
              <div class="px-4 pb-4">
                <BackendProjects
                  backendId={backend.id}
                  projects={data.projects}
                  canUpdate={data.canUpdate}
                />
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if data.canCreate || data.canUpdate}
  <BackendFormModal bind:open={formOpen} backend={formTarget} />
{/if}

{#if data.canDelete}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    dismissible={busy !== 'delete'}
    title={$_('stateIac.backends.deleteTitle')}
    description={$_('stateIac.backends.deleteDescription')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    {#if deleteTarget}
      <form
        id="state-backend-delete-form"
        method="POST"
        action="?/deleteBackend"
        use:enhance={confirmDelete}
      >
        <input type="hidden" name="backendId" value={deleteTarget.id} />
        <Field
          label={$_('stateIac.backends.typeToConfirm', { values: { name: deleteTarget.name } })}
        >
          {#snippet children(control)}
            <input
              {...control}
              name="confirmName"
              class="k-input font-mono text-[13px]"
              autocomplete="off"
              data-autofocus
              bind:value={deleteConfirm}
            />
          {/snippet}
        </Field>
      </form>
    {/if}
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="state-backend-delete-form"
        class="k-btn k-btn-danger"
        disabled={busy !== null || !deleteTarget || deleteConfirm !== deleteTarget.name}
      >
        {#if busy === 'delete'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Trash2
            class="h-4 w-4"
          />{/if}
        {$_('stateIac.backends.delete')}
      </button>
    {/snippet}
  </Modal>
{/if}
