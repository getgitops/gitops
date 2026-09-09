<script lang="ts">
  import { deserialize, enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import {
    Check,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Download,
    Edit3,
    Eye,
    EyeOff,
    Folder,
    FolderInput,
    Link2,
    Plus,
    Search,
    Shield,
    Upload,
  } from '@lucide/svelte';

  type VaultEnvironment = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
  };

  type VaultFolder = {
    id: string;
    parentFolderId: string | null;
    linkedFolderId: string | null;
    name: string;
    path: string;
    description?: string | null;
  };

  type VaultSecret = {
    id: string;
    folderId: string | null;
    key: string;
    description?: string | null;
    values: Record<string, string>;
  };

  export let data: {
    environments: VaultEnvironment[];
    folders: VaultFolder[];
    secrets: VaultSecret[];
    currentEnvironment?: VaultEnvironment | null;
    currentFolder?: VaultFolder | null;
    currentPath?: string;
    canManageSecrets: boolean;
    project?: { name?: string | null; slug?: string | null } | null;
  };

  let selectedEnvironmentSlug = '';
  let environmentMenuOpen = false;
  let environmentMenuEl: HTMLDivElement | null = null;
  let actionsMenuOpen = false;
  let actionsMenuEl: HTMLDivElement | null = null;
  let searchQuery = '';
  let importOpen = false;
  let importContent = '';
  let createSecretOpen = false;
  let createFolderOpen = false;
  let linkFolderOpen = false;
  let editingSecret: VaultSecret | null = null;
  let revealed: Record<string, boolean> = {};
  let formError = '';
  let success = '';
  let submitting = false;

  let newSecretKey = '';
  let newSecretValue = '';

  let editSecretKey = '';
  let editSecretDescription = '';
  let editSecretFolderId = '';
  let editSecretValues: Record<string, string> = {};

  let newFolderName = '';

  let linkedFolderPath = '';

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: currentFolderId = data.currentFolder?.id ?? null;
  $: currentPath = data.currentPath ?? '/';
  $: if (!selectedEnvironmentSlug && data.environments[0]) {
    selectedEnvironmentSlug = data.currentEnvironment?.slug ?? data.environments[0].slug;
  }

  $: if (
    data.currentEnvironment?.slug &&
    selectedEnvironmentSlug !== data.currentEnvironment.slug
  ) {
    selectedEnvironmentSlug = data.currentEnvironment.slug;
  }

  $: selectedEnvironment =
    data.environments.find((environment) => environment.slug === selectedEnvironmentSlug) ??
    data.environments[0] ??
    null;
  $: selectedFolder = data.folders.find((folder) => folder.id === currentFolderId) ?? null;
  $: childFolders = data.folders.filter((folder) => folder.parentFolderId === currentFolderId);
  $: visibleSecretFolderIds = selectedFolder ? folderScopeIds(selectedFolder) : [null];
  $: visibleSecrets = data.secrets.filter((secret) =>
    visibleSecretFolderIds.includes(secret.folderId),
  );
  $: filteredFolders = childFolders.filter((folder) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || folder.name.toLowerCase().includes(query);
  });
  $: filteredSecrets = visibleSecrets.filter((secret) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || secret.key.toLowerCase().includes(query);
  });
  $: allRevealed =
    visibleSecrets.length > 0 &&
    visibleSecrets.every((secret) => revealed[`${secret.id}:${selectedEnvironmentSlug}`]);
  $: parentFolder = selectedFolder?.parentFolderId
    ? (data.folders.find((folder) => folder.id === selectedFolder?.parentFolderId) ?? null)
    : null;

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  function folderScopeIds(folder: VaultFolder): Array<string | null> {
    const ids: Array<string | null> = [folder.id];

    if (folder.linkedFolderId) {
      const linkedFolder = data.folders.find((candidate) => candidate.id === folder.linkedFolderId);
      if (linkedFolder) ids.push(...folderScopeIds(linkedFolder));
    }

    return [...new Set(ids)];
  }

  function pathToUrl(path: string) {
    if (path === '/')
      return `/org/${orgSlug}/projects/${projectSlug}/vault/${selectedEnvironmentSlug}`;
    const encodedPath = path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `/org/${orgSlug}/projects/${projectSlug}/vault/${selectedEnvironmentSlug}/${encodedPath}`;
  }

  function goToFolder(folder: VaultFolder | null) {
    void goto(pathToUrl(folder?.path ?? '/'));
  }

  function changeEnvironment() {
    void goto(pathToUrl(currentPath));
  }

  function selectEnvironment(slug: string) {
    environmentMenuOpen = false;
    if (slug === selectedEnvironmentSlug) return;
    selectedEnvironmentSlug = slug;
    changeEnvironment();
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target as Node;
    if (environmentMenuOpen && environmentMenuEl && !environmentMenuEl.contains(target)) {
      environmentMenuOpen = false;
    }
    if (actionsMenuOpen && actionsMenuEl && !actionsMenuEl.contains(target)) {
      actionsMenuOpen = false;
    }
  }

  function toggleReveal(secret: VaultSecret) {
    const key = `${secret.id}:${selectedEnvironmentSlug}`;
    revealed = { ...revealed, [key]: !revealed[key] };
  }

  function toggleRevealAll() {
    revealed = allRevealed
      ? {}
      : Object.fromEntries(
          visibleSecrets.map((secret) => [`${secret.id}:${selectedEnvironmentSlug}`, true]),
        );
  }

  async function downloadEnvFile() {
    const response = await fetch('?/exportSecrets', {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body: new FormData(),
    });
    const result = deserialize(await response.text());

    if (result.type !== 'success' || !result.data) {
      formError = 'No se pudieron exportar los secretos';
      return;
    }

    const { content, filename } = result.data as { content: string; filename: string };
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function folderLabel(folder: VaultFolder) {
    const parent = folder.parentFolderId
      ? data.folders.find((candidate) => candidate.id === folder.parentFolderId)
      : null;
    return parent ? `${parent.name} / ${folder.name}` : folder.name;
  }

  function resetSecretForm() {
    newSecretKey = '';
    newSecretValue = '';
  }

  function openCreateSecret() {
    formError = '';
    resetSecretForm();
    createSecretOpen = true;
  }

  function openEditSecret(secret: VaultSecret) {
    formError = '';
    editingSecret = secret;
    editSecretKey = secret.key;
    editSecretDescription = secret.description ?? '';
    editSecretFolderId = secret.folderId ?? '';
    editSecretValues = Object.fromEntries(
      data.environments.map((environment) => [
        environment.slug,
        secret.values?.[environment.slug] ?? '',
      ]),
    );
  }

  function openCreateFolder() {
    formError = '';
    newFolderName = '';
    createFolderOpen = true;
  }

  function openLinkFolder() {
    formError = '';
    linkedFolderPath = '';
    linkFolderOpen = true;
  }

  function openImportSecrets() {
    formError = '';
    importContent = '';
    importOpen = true;
  }

  const handleSubmit: SubmitFunction = () => {
    formError = '';
    submitting = true;
    return async ({ result, update }) => {
      await update();
      submitting = false;

      if (result.type === 'success') {
        createSecretOpen = false;
        createFolderOpen = false;
        linkFolderOpen = false;
        importOpen = false;
        editingSecret = null;
        flashSuccess('Cambios guardados');
        return;
      }

      formError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'No se pudieron guardar los cambios';
    };
  };

  function maskValue(value: string | undefined) {
    if (!value) return 'Sin valor';
    return '************';
  }
</script>

<svelte:head>
  <title>Vault - GitOps</title>
</svelte:head>

<svelte:window on:click={handleWindowClick} />

<div class="space-y-6">
  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <section class="space-y-4">
    <div
      class="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
    >
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100">
        <Shield class="h-4 w-4 text-slate-600" />
      </span>

      <span class="truncate font-semibold text-slate-900">
        {data.project?.name ?? projectSlug}
      </span>

      <span class="text-slate-300">/</span>

      <div class="relative" bind:this={environmentMenuEl}>
        <button
          type="button"
          on:click={() => (environmentMenuOpen = !environmentMenuOpen)}
          aria-haspopup="listbox"
          aria-expanded={environmentMenuOpen}
          class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-slate-700 transition hover:bg-slate-100"
        >
          {selectedEnvironment?.name ?? selectedEnvironmentSlug}
          <ChevronDown class="h-3.5 w-3.5 text-slate-400" />
        </button>

        {#if environmentMenuOpen}
          <ul
            class="absolute left-0 z-20 mt-1 min-w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {#each data.environments as environment (environment.id)}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={environment.slug === selectedEnvironmentSlug}
                  on:click={() => selectEnvironment(environment.slug)}
                  class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span class="truncate">{environment.name}</span>
                  {#if environment.slug === selectedEnvironmentSlug}
                    <Check class="h-3.5 w-3.5 text-slate-500" />
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if currentPath !== '/'}
        <span class="text-slate-300">/</span>
        <span class="truncate font-mono text-slate-500">{currentPath.replace(/^\//, '')}</span>
      {/if}
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative w-full sm:max-w-xs">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Buscar key o carpeta"
          class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
        />
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          on:click={downloadEnvFile}
          aria-label="Descargar secretos"
          title="Descargar .env"
          class="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <Download class="h-4 w-4" />
        </button>
        <button
          type="button"
          on:click={toggleRevealAll}
          aria-label={allRevealed ? 'Ocultar secretos' : 'Ver secretos'}
          title={allRevealed ? 'Ocultar secretos' : 'Ver secretos'}
          class="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
        >
          {#if allRevealed}
            <EyeOff class="h-4 w-4" />
          {:else}
            <Eye class="h-4 w-4" />
          {/if}
        </button>

        {#if data.canManageSecrets}
          <div class="relative flex" bind:this={actionsMenuEl}>
            <button
              type="button"
              on:click={openCreateSecret}
              class="btn-primary inline-flex items-center gap-2 rounded-l-md px-3 py-2 text-sm font-medium"
            >
              <Plus class="h-4 w-4" /> Nuevo secreto
            </button>
            <button
              type="button"
              on:click={() => (actionsMenuOpen = !actionsMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              aria-label="Más acciones"
              class="btn-primary inline-flex items-center rounded-r-md border-l border-white/20 px-2 py-2"
            >
              <ChevronDown class="h-4 w-4" />
            </button>

            {#if actionsMenuOpen}
              <div
                role="menu"
                class="absolute right-0 top-full z-20 mt-1 min-w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  on:click={() => {
                    actionsMenuOpen = false;
                    openCreateFolder();
                  }}
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Folder class="h-4 w-4 text-slate-500" /> Add Folder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  on:click={() => {
                    actionsMenuOpen = false;
                    openLinkFolder();
                  }}
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Link2 class="h-4 w-4 text-slate-500" /> Link Folder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  on:click={() => {
                    actionsMenuOpen = false;
                    openImportSecrets();
                  }}
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Upload class="h-4 w-4 text-slate-500" /> Import Secrets
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">Key</th>
              <th class="px-4 py-3">Value</th>
              <th class="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {#if filteredFolders.length === 0 && filteredSecrets.length === 0}
              <tr>
                <td class="px-4 py-8 text-center text-sm text-slate-500" colspan="3">
                  No hay carpetas ni secretos en esta vista.
                </td>
              </tr>
            {:else}
              {#if currentFolderId}
                <tr
                  class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  on:click={() => goToFolder(parentFolder)}
                >
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-900"
                    >
                      <ChevronRight class="h-4 w-4 rotate-180 text-slate-500" />
                      <span class="truncate">..</span>
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-500"></td>
                  <td class="px-4 py-3 text-right">
                    <ChevronRight class="ml-auto h-4 w-4 text-slate-400" />
                  </td>
                </tr>
              {/if}
              {#each filteredFolders as folder (folder.id)}
                <tr
                  class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  on:click={() => goToFolder(folder)}
                >
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-900"
                    >
                      {#if folder.linkedFolderId}
                        <Link2 class="h-4 w-4 shrink-0 text-slate-500" />
                      {:else}
                        <Folder class="h-4 w-4 shrink-0 text-slate-500" />
                      {/if}
                      <span class="truncate">{folder.name}</span>
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-500"></td>
                  <td class="px-4 py-3 text-right">
                    <ChevronRight class="ml-auto h-4 w-4 text-slate-400" />
                  </td>
                </tr>
              {/each}
              {#each filteredSecrets as secret (secret.id)}
                <tr class="border-t border-slate-100 align-top">
                  <td class="px-4 py-3">
                    <p class="font-mono text-sm font-semibold text-slate-900">{secret.key}</p>
                  </td>
                  <td class="px-4 py-3">
                    <button
                      type="button"
                      on:click={() => toggleReveal(secret)}
                      title={revealed[`${secret.id}:${selectedEnvironmentSlug}`]
                        ? 'Ocultar valor'
                        : 'Mostrar valor'}
                      class="block w-60 truncate text-left font-mono text-sm text-slate-700 hover:text-slate-900"
                    >
                      {#if revealed[`${secret.id}:${selectedEnvironmentSlug}`]}
                        {secret.values?.[selectedEnvironmentSlug] || 'Sin valor'}
                      {:else}
                        {maskValue(secret.values?.[selectedEnvironmentSlug])}
                      {/if}
                    </button>
                  </td>
                  <td class="px-4 py-3 text-right">
                    {#if data.canManageSecrets}
                      <button
                        type="button"
                        on:click={() => openEditSecret(secret)}
                        class="inline-flex items-center justify-center rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        aria-label="Editar secreto"
                      >
                        <Edit3 class="h-4 w-4" />
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</div>

{#if createSecretOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/createSecret"
      use:enhance={handleSubmit}
      class="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"
    >
      <h3 class="text-lg font-semibold text-slate-900">Crear secreto</h3>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <input type="hidden" name="folderId" value={currentFolderId ?? ''} />
      <div class="mt-5 space-y-4">
        <label class="block text-sm font-medium text-slate-700"
          >Key<input
            name="key"
            bind:value={newSecretKey}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="block text-sm font-medium text-slate-700"
          >Value<input
            name={`value:${selectedEnvironmentSlug}`}
            bind:value={newSecretValue}
            class="field-input mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
          /></label
        >
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (createSecretOpen = false)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button disabled={submitting} class="btn-primary rounded-md px-3 py-2 text-sm"
          >Guardar</button
        >
      </div>
    </form>
  </div>
{/if}

{#if editingSecret}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/updateSecret"
      use:enhance={handleSubmit}
      class="w-full max-w-2xl rounded-md bg-white p-6 shadow-xl"
    >
      <input type="hidden" name="id" value={editingSecret.id} />
      <h3 class="text-lg font-semibold text-slate-900">Detalle del secreto</h3>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-medium text-slate-700"
          >Key<input
            name="key"
            bind:value={editSecretKey}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <label class="text-sm font-medium text-slate-700"
          >Carpeta<select
            name="folderId"
            bind:value={editSecretFolderId}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
            ><option value="">Root</option>{#each data.folders as folder}<option value={folder.id}
                >{folderLabel(folder)}</option
              >{/each}</select
          ></label
        >
        <label class="text-sm font-medium text-slate-700 sm:col-span-2"
          >Descripcion<textarea
            name="description"
            bind:value={editSecretDescription}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"></textarea></label
        >
        {#each data.environments as environment (environment.id)}
          <label class="text-sm font-medium text-slate-700"
            >{environment.name}<input
              name={`value:${environment.slug}`}
              bind:value={editSecretValues[environment.slug]}
              class="field-input mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
            /></label
          >
        {/each}
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (editingSecret = null)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button disabled={submitting} class="btn-primary rounded-md px-3 py-2 text-sm"
          >Guardar</button
        >
      </div>
    </form>
  </div>
{/if}

{#if createFolderOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/createFolder"
      use:enhance={handleSubmit}
      class="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"
    >
      <h3 class="text-lg font-semibold text-slate-900">Crear carpeta</h3>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <input type="hidden" name="parentFolderId" value={currentFolderId ?? ''} />
      <div class="mt-5">
        <label class="block text-sm font-medium text-slate-700"
          >Nombre<input
            name="name"
            bind:value={newFolderName}
            class="field-input mt-1 w-full rounded-md border px-3 py-2"
          /></label
        >
        <p class="mt-2 text-xs text-slate-500">
          Se creara en <span class="font-mono">{currentPath}</span>
        </p>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (createFolderOpen = false)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button disabled={submitting} class="btn-primary rounded-md px-3 py-2 text-sm"
          ><FolderInput class="mr-2 inline h-4 w-4" />Crear</button
        >
      </div>
    </form>
  </div>
{/if}

{#if linkFolderOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/linkFolder"
      use:enhance={handleSubmit}
      class="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"
    >
      <h3 class="text-lg font-semibold text-slate-900">Enlazar carpeta</h3>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <input type="hidden" name="parentFolderId" value={currentFolderId ?? ''} />
      <div class="mt-5">
        <label class="block text-sm font-medium text-slate-700"
          >Path a enlazar<input
            name="linkedPath"
            bind:value={linkedFolderPath}
            placeholder="/common/database"
            class="field-input mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
          /></label
        >
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (linkFolderOpen = false)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button
          disabled={submitting || !linkedFolderPath.trim()}
          class="btn-primary rounded-md px-3 py-2 text-sm">Enlazar</button
        >
      </div>
    </form>
  </div>
{/if}

{#if importOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <form
      method="POST"
      action="?/importSecrets"
      use:enhance={handleSubmit}
      class="w-full max-w-lg rounded-md bg-white p-6 shadow-xl"
    >
      <h3 class="text-lg font-semibold text-slate-900">Importar secretos</h3>
      <p class="mt-1 text-sm text-slate-600">
        Pega el contenido de un archivo .env para el entorno {selectedEnvironment?.name ??
          selectedEnvironmentSlug}.
      </p>
      {#if formError}<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>{/if}
      <input type="hidden" name="folderId" value={currentFolderId ?? ''} />
      <input type="hidden" name="environmentSlug" value={selectedEnvironmentSlug} />
      <textarea
        name="content"
        bind:value={importContent}
        rows="10"
        placeholder={'API_KEY=123\nDATABASE_URL=postgres://...'}
        class="field-input mt-4 w-full rounded-md border px-3 py-2 font-mono text-sm"
      ></textarea>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          on:click={() => (importOpen = false)}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancelar</button
        ><button
          disabled={submitting || !importContent.trim()}
          class="btn-primary rounded-md px-3 py-2 text-sm">Importar</button
        >
      </div>
    </form>
  </div>
{/if}
