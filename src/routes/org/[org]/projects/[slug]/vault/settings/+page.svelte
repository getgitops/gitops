<script lang="ts">
  import { tick } from 'svelte';
  import { deserialize, enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '$app/forms';
  import { ArrowDown, ArrowUp, Layers, LockKeyhole, Pencil, Plus, Trash2 } from '@lucide/svelte';
  import { Field, Modal, Switch, toast } from '#lib/components/ui';

  type VaultEnvironment = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    order: number;
    createdAt: string;
  };

  let {
    data,
  }: {
    data: {
      settings: { capitalizeSecrets: boolean; encryptionProvider: string };
      encryptionProviders: { value: string; label: string }[];
      canManageSettings: boolean;
      environments: VaultEnvironment[];
      canManageEnvironments: boolean;
      canDeleteEnvironments: boolean;
    };
  } = $props();

  // ---------- ajustes generales ----------

  // valor optimista: se reescribe al volver los datos del servidor
  let capitalizeSecrets = $derived(data.settings.capitalizeSecrets);
  let savingSettings = $state(false);
  let settingsForm = $state<HTMLFormElement>();

  async function submitSettings() {
    // el Switch actualiza su input oculto en el siguiente render
    await tick();
    settingsForm?.requestSubmit();
  }

  const submitSettingsForm: SubmitFunction = () => {
    savingSettings = true;
    return async ({ result, update }) => {
      savingSettings = false;
      if (result.type === 'success') {
        toast.success(
          'Ajustes guardados',
          capitalizeSecrets
            ? 'Las claves se guardarán en mayúsculas.'
            : 'Las claves se guardan tal cual.',
        );
      } else if (result.type === 'failure') {
        capitalizeSecrets = data.settings.capitalizeSecrets;
        toast.error(
          'No se pudieron guardar los ajustes',
          result.data?.error ? String(result.data.error) : undefined,
        );
      }
      await update({ reset: false });
    };
  };

  // ---------- entornos ----------

  let environmentOpen = $state(false);
  let deleteOpen = $state(false);
  let submitting = $state(false);
  let moving = $state(false);

  let editingEnvironment = $state<VaultEnvironment | null>(null);
  let deletingEnvironment = $state<VaultEnvironment | null>(null);
  let environmentName = $state('');
  let environmentSlug = $state('');
  let environmentDescription = $state('');
  let slugTouched = $state(false);
  let confirmText = $state('');

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function openCreateEnvironment() {
    editingEnvironment = null;
    environmentName = '';
    environmentSlug = '';
    environmentDescription = '';
    slugTouched = false;
    environmentOpen = true;
  }

  function openEditEnvironment(environment: VaultEnvironment) {
    editingEnvironment = environment;
    environmentName = environment.name;
    environmentSlug = environment.slug;
    environmentDescription = environment.description ?? '';
    slugTouched = true;
    environmentOpen = true;
  }

  function openDeleteEnvironment(environment: VaultEnvironment) {
    deletingEnvironment = environment;
    confirmText = '';
    deleteOpen = true;
  }

  const submitWith =
    (success: () => [string, string?]): SubmitFunction =>
    () => {
      submitting = true;
      const [title, description] = success();
      return async ({ result, update }) => {
        submitting = false;
        if (result.type === 'success') {
          environmentOpen = false;
          deleteOpen = false;
          toast.success(title, description);
          await update();
        } else if (result.type === 'failure') {
          toast.error(
            'No se pudieron guardar los cambios',
            result.data?.error ? String(result.data.error) : undefined,
          );
        } else {
          await update();
        }
      };
    };

  async function moveEnvironment(environment: VaultEnvironment, direction: 'up' | 'down') {
    if (moving) return;
    moving = true;

    const body = new FormData();
    body.set('id', environment.id);
    body.set('direction', direction);

    const response = await fetch('?/moveEnvironment', {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body,
    });
    const result = deserialize(await response.text());
    moving = false;

    if (result.type !== 'success') {
      toast.error(
        'No se pudo reordenar el entorno',
        result.type === 'failure' && result.data?.error ? String(result.data.error) : undefined,
      );
      return;
    }

    await invalidateAll();
  }

  const providerLabel = $derived(
    data.encryptionProviders.find((provider) => provider.value === data.settings.encryptionProvider)
      ?.label ?? data.settings.encryptionProvider,
  );
</script>

<svelte:head>
  <title>Ajustes del vault - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">Ajustes del vault</h1>
    <p class="mt-1 text-sm text-fg-muted">
      Comportamiento de los secretos, entornos y cifrado de este proyecto.
    </p>
  </header>

  <!-- General -->
  <section class="k-card p-6">
    <form
      bind:this={settingsForm}
      method="POST"
      action="?/updateSettings"
      class="flex items-start justify-between gap-6"
      use:enhance={submitSettingsForm}
    >
      <input type="hidden" name="encryptionProvider" value={data.settings.encryptionProvider} />
      <div>
        <h2 class="font-semibold text-white" id="capitalize-label">Claves en mayúsculas</h2>
        <p class="mt-1 text-sm text-fg-muted" id="capitalize-help">
          Fuerza que las claves de los secretos se guarden siempre en mayúsculas (<span
            class="font-mono text-xs">database_url</span
          >
          →
          <span class="font-mono text-xs">DATABASE_URL</span>).
        </p>
      </div>
      <Switch
        name="capitalizeSecrets"
        label="Claves en mayúsculas"
        aria-describedby="capitalize-help"
        bind:checked={capitalizeSecrets}
        disabled={!data.canManageSettings || savingSettings}
        onchange={submitSettings}
      />
    </form>
  </section>

  <!-- Entornos -->
  <section class="k-card overflow-hidden">
    <div
      class="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-6 py-4"
    >
      <div>
        <h2 class="font-semibold text-white">Entornos</h2>
        <p class="mt-0.5 text-sm text-fg-muted">
          Cada secreto tiene un valor por entorno. El orden es el de las pestañas de Secretos.
        </p>
      </div>
      {#if data.canManageEnvironments}
        <button
          type="button"
          class="k-btn k-btn-secondary k-btn-sm"
          onclick={openCreateEnvironment}
        >
          <Plus class="h-3.5 w-3.5" />Nuevo entorno
        </button>
      {/if}
    </div>

    {#if data.environments.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
          <Layers class="h-6 w-6" />
        </span>
        <p class="text-sm font-medium text-white">Aún no hay entornos</p>
      </div>
    {:else}
      <ul class="divide-y divide-white/6">
        {#each data.environments as environment, index (environment.id)}
          <li class="flex items-center gap-4 px-6 py-3.5">
            {#if data.canManageEnvironments}
              <div class="flex flex-col">
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon h-6 w-6"
                  disabled={moving || index === 0}
                  onclick={() => moveEnvironment(environment, 'up')}
                  aria-label="Subir {environment.name}"><ArrowUp class="h-3.5 w-3.5" /></button
                >
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon h-6 w-6"
                  disabled={moving || index === data.environments.length - 1}
                  onclick={() => moveEnvironment(environment, 'down')}
                  aria-label="Bajar {environment.name}"><ArrowDown class="h-3.5 w-3.5" /></button
                >
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 text-sm font-medium text-white">
                {environment.name}
                <span class="k-badge font-mono">{environment.slug}</span>
                {#if /^prod/i.test(environment.slug)}
                  <span class="k-badge k-badge-warn">Producción</span>
                {/if}
              </p>
              {#if environment.description}
                <p class="mt-0.5 truncate text-xs text-fg-subtle">{environment.description}</p>
              {/if}
            </div>
            <div class="flex items-center gap-1">
              {#if data.canManageEnvironments}
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-sm"
                  onclick={() => openEditEnvironment(environment)}
                  ><Pencil class="h-3.5 w-3.5" />Editar</button
                >
              {/if}
              {#if data.canDeleteEnvironments}
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                  disabled={data.environments.length <= 1}
                  title={data.environments.length <= 1
                    ? 'Debe existir al menos un entorno'
                    : undefined}
                  onclick={() => openDeleteEnvironment(environment)}
                  aria-label="Borrar {environment.name}"><Trash2 class="h-3.5 w-3.5" /></button
                >
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Cifrado -->
  <section class="k-card p-6">
    <div class="flex items-start gap-4">
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><LockKeyhole class="h-5 w-5" /></span
      >
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-white">Cifrado</h2>
          <span class="k-badge k-badge-brand">Pronto</span>
        </div>
        <p class="mt-1 text-sm text-fg-muted">
          Proveedor con el que se cifran los secretos en reposo. De momento solo está disponible
          <span class="text-fg">{providerLabel}</span>.
        </p>
        <div class="mt-4 max-w-sm">
          <Field label="Proveedor">
            {#snippet children(control)}
              <select class="k-input" disabled {...control}>
                {#each data.encryptionProviders as provider (provider.value)}
                  <option
                    value={provider.value}
                    selected={provider.value === data.settings.encryptionProvider}
                    >{provider.label}</option
                  >
                {/each}
              </select>
            {/snippet}
          </Field>
        </div>
      </div>
    </div>
  </section>
</div>

<Modal
  bind:open={environmentOpen}
  title={editingEnvironment ? 'Editar entorno' : 'Nuevo entorno'}
  description={editingEnvironment
    ? 'El slug se usa en la URL de los secretos, en la CLI y en la API.'
    : 'Los secretos existentes tendrán este entorno sin valor hasta que lo rellenes.'}
  dismissible={!submitting}
>
  <form
    id="form-entorno"
    method="POST"
    action={editingEnvironment ? '?/updateEnvironment' : '?/createEnvironment'}
    class="space-y-5"
    use:enhance={submitWith(() => [
      editingEnvironment ? 'Entorno guardado' : 'Entorno creado',
      `${environmentName} · ${environmentSlug}`,
    ])}
  >
    {#if editingEnvironment}<input type="hidden" name="id" value={editingEnvironment.id} />{/if}
    <Field label="Nombre" required>
      {#snippet children(control)}
        <input
          class="k-input"
          name="name"
          placeholder="Staging"
          autocomplete="off"
          data-autofocus
          bind:value={environmentName}
          oninput={() => {
            if (!slugTouched) environmentSlug = slugify(environmentName);
          }}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label="Slug" help="Se usa en la URL, la CLI y la API. Por ejemplo: staging" required>
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="slug"
          placeholder="staging"
          autocomplete="off"
          spellcheck="false"
          bind:value={environmentSlug}
          oninput={() => (slugTouched = true)}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label="Descripción">
      {#snippet aside()}Opcional{/snippet}
      {#snippet children(control)}
        <textarea
          class="k-input"
          name="description"
          rows="3"
          bind:value={environmentDescription}
          {...control}></textarea>
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (environmentOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-entorno"
      class="k-btn k-btn-primary"
      disabled={submitting || !environmentName.trim() || !environmentSlug.trim()}
      >{editingEnvironment ? 'Guardar cambios' : 'Crear entorno'}</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={deleteOpen}
  role="alertdialog"
  size="sm"
  dismissible={!submitting}
  title="¿Borrar el entorno?"
  description="Se quitará {deletingEnvironment?.name ??
    ''} del vault y sus valores dejarán de mostrarse. Quedará un commit en GitDB, pero no se puede deshacer desde la interfaz."
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  <form
    id="form-borrar-entorno"
    method="POST"
    action="?/deleteEnvironment"
    use:enhance={submitWith(() => ['Entorno borrado', deletingEnvironment?.name])}
  >
    <input type="hidden" name="id" value={deletingEnvironment?.id ?? ''} />
    <Field label="Escribe {deletingEnvironment?.slug ?? ''} para confirmar">
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          autocomplete="off"
          spellcheck="false"
          data-autofocus
          bind:value={confirmText}
          {...control}
        />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-borrar-entorno"
      class="k-btn k-btn-danger"
      disabled={submitting || confirmText !== deletingEnvironment?.slug}>Borrar entorno</button
    >
  {/snippet}
</Modal>
