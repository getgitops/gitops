<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from '@lucide/svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';

  type VaultEnvironment = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    order: number;
    createdAt: string;
  };

  export let data: {
    settings: { capitalizeSecrets: boolean; encryptionProvider: string };
    encryptionProviders: { value: string; label: string }[];
    canManageSettings: boolean;
    environments: VaultEnvironment[];
    canManageEnvironments: boolean;
    canDeleteEnvironments: boolean;
  };

  let capitalizeSecrets = data.settings.capitalizeSecrets;
  let encryptionProvider = data.settings.encryptionProvider;
  let formError = '';
  let success = '';
  let submitting = false;
  let moving = false;

  let createEnvironmentOpen = false;
  let editingEnvironment: VaultEnvironment | null = null;
  let deletingEnvironment: VaultEnvironment | null = null;
  let environmentName = '';
  let environmentSlug = '';
  let environmentDescription = '';

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  function openCreateEnvironment() {
    formError = '';
    environmentName = '';
    environmentSlug = '';
    environmentDescription = '';
    createEnvironmentOpen = true;
  }

  function openEditEnvironment(environment: VaultEnvironment) {
    formError = '';
    editingEnvironment = environment;
    environmentName = environment.name;
    environmentSlug = environment.slug;
    environmentDescription = environment.description ?? '';
  }

  const handleSubmit: SubmitFunction = () => {
    formError = '';
    submitting = true;
    return async ({ result, update }) => {
      await update();
      submitting = false;

      if (result.type === 'success') {
        createEnvironmentOpen = false;
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

  async function moveEnvironment(environment: VaultEnvironment, direction: 'up' | 'down') {
    if (moving) return;
    moving = true;
    formError = '';

    const body = new FormData();
    body.set('id', environment.id);
    body.set('direction', direction);

    const response = await fetch('?/moveEnvironment', { method: 'POST', body });
    moving = false;

    if (!response.ok) {
      formError = 'No se pudo reordenar el entorno';
      return;
    }

    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Vault settings - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Vault</p>
    <h2 class="mt-1 text-2xl font-semibold text-slate-950">Settings</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
      Configura el comportamiento general del vault de este proyecto.
    </p>
  </section>

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  {#if formError}
    <p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
  {/if}

  <div class="flex w-full flex-col gap-6">
    <!-- Capitalize -->
    <section class="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <form
        method="POST"
        action="?/updateSettings"
        use:enhance={handleSubmit}
        class="flex items-center justify-between gap-4"
      >
        <input type="hidden" name="encryptionProvider" value={encryptionProvider} />
        <div>
          <h3 class="text-sm font-semibold text-slate-900">Capitalize all secrets</h3>
          <p class="mt-1 text-sm text-slate-500">
            Fuerza que las keys de los secretos se guarden siempre en mayusculas.
          </p>
        </div>
        <label class="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            name="capitalizeSecrets"
            bind:checked={capitalizeSecrets}
            disabled={!data.canManageSettings || submitting}
            on:change={(event) => event.currentTarget.form?.requestSubmit()}
            class="peer sr-only"
          />
          <span
            class="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-disabled:opacity-50"
          ></span>
          <span
            class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
          ></span>
        </label>
      </form>
    </section>

    <!-- Environments -->
    <section class="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-sm font-semibold text-slate-900">Environments</h3>
          <p class="mt-1 text-sm text-slate-500">
            Gestiona los entornos que aparecen como columnas de valores en la tabla de secretos.
          </p>
        </div>
        {#if data.canManageEnvironments}
          <button
            type="button"
            on:click={openCreateEnvironment}
            class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" /> Nuevo
          </button>
        {/if}
      </div>

      <div class="mt-4 overflow-hidden rounded-md border border-slate-200">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <tbody>
              {#each data.environments as environment, index (environment.id)}
                <tr class="border-t border-slate-100 first:border-t-0">
                  <td class="w-10 px-3 py-2">
                    {#if data.canManageEnvironments}
                      <div class="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={moving || index === 0}
                          on:click={() => moveEnvironment(environment, 'up')}
                          class="rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Subir entorno"><ChevronUp class="h-3.5 w-3.5" /></button
                        >
                        <button
                          type="button"
                          disabled={moving || index === data.environments.length - 1}
                          on:click={() => moveEnvironment(environment, 'down')}
                          class="rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Bajar entorno"><ChevronDown class="h-3.5 w-3.5" /></button
                        >
                      </div>
                    {/if}
                  </td>
                  <td class="px-3 py-2">
                    <p class="font-medium text-slate-900">{environment.name}</p>
                    <p class="font-mono text-xs text-slate-500">{environment.slug}</p>
                  </td>
                  <td class="px-3 py-2 text-right">
                    {#if data.canManageEnvironments}
                      <button
                        type="button"
                        on:click={() => openEditEnvironment(environment)}
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
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Encryption -->
    <section class="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold text-slate-900">Encryption</h3>
        <span
          class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
        >
          Soon
        </span>
      </div>
      <p class="mt-1 text-sm text-slate-500">Proveedor usado para cifrar los secretos en reposo.</p>
      <form
        method="POST"
        action="?/updateSettings"
        use:enhance={handleSubmit}
        class="mt-4 flex items-center gap-3"
      >
        <input type="hidden" name="capitalizeSecrets" value={capitalizeSecrets ? 'on' : ''} />
        <input type="hidden" name="encryptionProvider" value={encryptionProvider} />
        <Dropdown
          options={data.encryptionProviders.map((provider) => ({
            id: provider.value,
            name: provider.label,
          }))}
          value={encryptionProvider}
          disabled
          ariaLabel="Encryption provider"
          on:change={(event) => (encryptionProvider = event.detail.id)}
        />
        <button disabled class="btn-primary shrink-0 rounded-md px-4 py-2 text-sm font-medium"
          >Guardar</button
        >
      </form>
    </section>
  </div>
</div>

{#if createEnvironmentOpen || editingEnvironment}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action={editingEnvironment ? '?/updateEnvironment' : '?/createEnvironment'}
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
            bind:value={environmentName}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="block text-sm font-medium text-slate-700"
          >Slug<input
            name="slug"
            bind:value={environmentSlug}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="block text-sm font-medium text-slate-700"
          >Descripcion<textarea
            name="description"
            bind:value={environmentDescription}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"></textarea></label
        >
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => {
            createEnvironmentOpen = false;
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
      action="?/deleteEnvironment"
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
          class="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
          >Borrar</button
        >
      </div>
    </form>
  </div>
{/if}
