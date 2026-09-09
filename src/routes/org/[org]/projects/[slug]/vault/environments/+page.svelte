<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, Edit3, Plus, Trash2 } from '@lucide/svelte';

  type VaultEnvironment = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    createdAt: string;
  };

  export let data: {
    environments: VaultEnvironment[];
    canManageEnvironments: boolean;
    canDeleteEnvironments: boolean;
  };

  let createOpen = false;
  let editingEnvironment: VaultEnvironment | null = null;
  let deletingEnvironment: VaultEnvironment | null = null;
  let name = '';
  let slug = '';
  let description = '';
  let formError = '';
  let success = '';
  let submitting = false;

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  function openCreate() {
    formError = '';
    name = '';
    slug = '';
    description = '';
    createOpen = true;
  }

  function openEdit(environment: VaultEnvironment) {
    formError = '';
    editingEnvironment = environment;
    name = environment.name;
    slug = environment.slug;
    description = environment.description ?? '';
  }

  const handleSubmit: SubmitFunction = () => {
    formError = '';
    submitting = true;
    return async ({ result, update }) => {
      await update();
      submitting = false;

      if (result.type === 'success') {
        createOpen = false;
        editingEnvironment = null;
        deletingEnvironment = null;
        flashSuccess('Cambios guardados');
        return;
      }

      formError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'No se pudieron guardar los cambios';
    };
  };

  function formatDate(value: string) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
  }
</script>

<svelte:head>
  <title>Vault environments - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Vault</p>
      <h2 class="mt-1 text-2xl font-semibold text-slate-950">Entornos</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Gestiona los entornos que aparecen como columnas de valores en la tabla de secretos.
      </p>
    </div>

    {#if data.canManageEnvironments}
      <button
        type="button"
        on:click={openCreate}
        class="btn-primary inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Plus class="h-4 w-4" /> Nuevo entorno
      </button>
    {/if}
  </section>

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <div class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
    <div class="overflow-x-auto">
      <table class="w-full min-w-160 text-sm">
        <thead>
          <tr
            class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            <th class="px-4 py-3">Nombre</th>
            <th class="px-4 py-3">Slug</th>
            <th class="px-4 py-3">Descripcion</th>
            <th class="px-4 py-3">Creado</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each data.environments as environment (environment.id)}
            <tr class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium text-slate-900">{environment.name}</td>
              <td class="px-4 py-3 font-mono text-xs text-slate-600">{environment.slug}</td>
              <td class="px-4 py-3 text-slate-600">{environment.description || '-'}</td>
              <td class="px-4 py-3 text-slate-600">{formatDate(environment.createdAt)}</td>
              <td class="px-4 py-3 text-right">
                {#if data.canManageEnvironments || data.canDeleteEnvironments}
                  {#if data.canManageEnvironments}
                    <button
                      type="button"
                      on:click={() => openEdit(environment)}
                      class="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Editar entorno"><Edit3 class="h-4 w-4" /></button
                    >
                  {/if}
                  {#if data.canDeleteEnvironments}
                    <button
                      type="button"
                      on:click={() => (deletingEnvironment = environment)}
                      class="ml-2 rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                      aria-label="Borrar entorno"><Trash2 class="h-4 w-4" /></button
                    >
                  {/if}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

{#if createOpen || editingEnvironment}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action={editingEnvironment ? '?/update' : '?/create'}
      use:enhance={handleSubmit}
      class="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"
    >
      {#if editingEnvironment}<input type="hidden" name="id" value={editingEnvironment.id} />{/if}
      <h3 class="text-lg font-semibold text-slate-900">
        {editingEnvironment ? 'Editar entorno' : 'Crear entorno'}
      </h3>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <div class="mt-5 space-y-4">
        <label class="block text-sm font-medium text-slate-700"
          >Nombre<input
            name="name"
            bind:value={name}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="block text-sm font-medium text-slate-700"
          >Slug<input
            name="slug"
            bind:value={slug}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="block text-sm font-medium text-slate-700"
          >Descripcion<textarea
            name="description"
            bind:value={description}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"></textarea></label
        >
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => {
            createOpen = false;
            editingEnvironment = null;
          }}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button disabled={submitting} class="btn-primary rounded-md px-3 py-2 text-sm"
          >Guardar</button
        >
      </div>
    </form>
  </div>
{/if}

{#if deletingEnvironment}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/delete"
      use:enhance={handleSubmit}
      class="w-full max-w-md rounded-md bg-white p-6 shadow-xl"
    >
      <input type="hidden" name="id" value={deletingEnvironment.id} />
      <h3 class="text-lg font-semibold text-slate-900">Borrar entorno</h3>
      <p class="mt-2 text-sm leading-6 text-slate-600">
        Se borrara <strong>{deletingEnvironment.name}</strong> de la configuracion del vault.
      </p>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (deletingEnvironment = null)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button
          disabled={submitting}
          class="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >Borrar</button
        >
      </div>
    </form>
  </div>
{/if}
