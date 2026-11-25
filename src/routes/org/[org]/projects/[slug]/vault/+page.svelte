<script lang="ts">
  import { deserialize, enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import {
    ChevronDown,
    ChevronRight,
    Copy,
    CopyPlus,
    CornerLeftUp,
    Download,
    Eye,
    EyeOff,
    FileUp,
    Folder,
    FolderPlus,
    Link2,
    Pencil,
    Plus,
    Search,
    Trash2,
    TriangleAlert,
    Upload,
  } from '@lucide/svelte';
  import { DropdownMenu, Field, MenuItem, Modal, Tabs, toast } from '#lib/components/ui';

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

  type VaultPageData = {
    environments: VaultEnvironment[];
    folders: VaultFolder[];
    secrets: VaultSecret[];
    currentEnvironment?: VaultEnvironment | null;
    currentFolder?: VaultFolder | null;
    currentPath?: string;
    canManageSecrets: boolean;
    canDeleteSecrets: boolean;
    capitalizeSecrets: boolean;
    project?: { name?: string | null; slug?: string | null } | null;
  };

  let { data }: { data: VaultPageData } = $props();

  const page = createPageStore();
  const orgSlug = $derived($page.params.org);
  const projectSlug = $derived($page.params.slug);

  const environmentSlug = $derived(
    data.currentEnvironment?.slug ?? data.environments[0]?.slug ?? '',
  );
  const environment = $derived(
    data.environments.find((candidate) => candidate.slug === environmentSlug) ?? null,
  );
  const environmentName = $derived(environment?.name ?? environmentSlug);
  const isProduction = $derived(/^prod/i.test(environmentSlug));
  const otherEnvironments = $derived(
    data.environments.filter((candidate) => candidate.slug !== environmentSlug),
  );

  const currentFolderId = $derived(data.currentFolder?.id ?? null);
  const currentPath = $derived(data.currentPath ?? '/');
  const currentFolder = $derived(
    data.folders.find((folder) => folder.id === currentFolderId) ?? null,
  );
  const parentFolder = $derived(
    currentFolder?.parentFolderId
      ? (data.folders.find((folder) => folder.id === currentFolder.parentFolderId) ?? null)
      : null,
  );
  const pathSegments = $derived(
    currentPath
      .split('/')
      .filter(Boolean)
      .map((name, index, all) => ({ name, path: `/${all.slice(0, index + 1).join('/')}` })),
  );

  let searchQuery = $state('');
  const query = $derived(searchQuery.trim().toLowerCase());

  const childFolders = $derived(
    data.folders.filter((folder) => folder.parentFolderId === currentFolderId),
  );
  const visibleSecrets = $derived.by(() => {
    const ids = currentFolder ? folderScopeIds(currentFolder) : [null];
    return data.secrets.filter((secret) => ids.includes(secret.folderId));
  });
  const filteredFolders = $derived(
    childFolders.filter((folder) => !query || folder.name.toLowerCase().includes(query)),
  );
  const filteredSecrets = $derived(
    visibleSecrets.filter((secret) => !query || secret.key.toLowerCase().includes(query)),
  );
  const isEmpty = $derived(childFolders.length === 0 && visibleSecrets.length === 0);

  // valores visibles, por secreto y entorno
  let revealed = $state<Record<string, boolean>>({});
  const revealKey = (secret: VaultSecret) => `${secret.id}:${environmentSlug}`;
  const allRevealed = $derived(
    visibleSecrets.length > 0 && visibleSecrets.every((secret) => revealed[revealKey(secret)]),
  );

  function folderScopeIds(folder: VaultFolder, seen = new Set<string>()): Array<string | null> {
    if (seen.has(folder.id)) return [];
    seen.add(folder.id);
    const ids: Array<string | null> = [folder.id];
    if (folder.linkedFolderId) {
      const linked = data.folders.find((candidate) => candidate.id === folder.linkedFolderId);
      if (linked) ids.push(...folderScopeIds(linked, seen));
    }
    return [...new Set(ids)];
  }

  function linkedPath(folder: VaultFolder) {
    return data.folders.find((candidate) => candidate.id === folder.linkedFolderId)?.path ?? null;
  }

  function vaultUrl(path: string, slug = environmentSlug) {
    const base = `/org/${orgSlug}/projects/${projectSlug}/vault/${slug}`;
    if (path === '/') return base;
    const encoded = path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${base}/${encoded}`;
  }

  function goToFolder(folder: VaultFolder | null) {
    void goto(vaultUrl(folder?.path ?? '/'));
  }

  function selectEnvironment(slug: string) {
    if (slug !== data.currentEnvironment?.slug) void goto(vaultUrl(currentPath, slug));
  }

  function toggleReveal(secret: VaultSecret) {
    const key = revealKey(secret);
    revealed = { ...revealed, [key]: !revealed[key] };
  }

  function toggleRevealAll() {
    revealed = allRevealed
      ? {}
      : Object.fromEntries(visibleSecrets.map((secret) => [revealKey(secret), true]));
  }

  async function copyValue(secret: VaultSecret) {
    const value = secret.values?.[environmentSlug];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Valor copiado', `${secret.key} · ${environmentSlug}`);
    } catch {
      toast.error('No se pudo copiar', 'El navegador no permite acceder al portapapeles.');
    }
  }

  function normalizeKey(value: string) {
    return data.capitalizeSecrets ? value.toUpperCase() : value;
  }

  // ---------- importar arrastrando un .env ----------

  let dropActive = $state(false);

  async function uploadEnvContent(content: string) {
    const body = new FormData();
    body.set('folderId', currentFolderId ?? '');
    body.set('environmentSlug', environmentSlug);
    body.set('content', content);

    const response = await fetch('?/importSecrets', {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body,
    });
    const result = deserialize(await response.text());

    if (result.type !== 'success') {
      toast.error(
        'No se pudo importar el archivo',
        result.type === 'failure' && result.data?.error ? String(result.data.error) : undefined,
      );
      return;
    }

    await invalidateAll();
    toast.success('Secretos importados', `${environmentName} · ${currentPath}`);
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    dropActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) await uploadEnvContent(await file.text());
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dropActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    const related = event.relatedTarget as Node | null;
    if (related && (event.currentTarget as HTMLElement).contains(related)) return;
    dropActive = false;
  }

  let fileInput = $state<HTMLInputElement>();

  async function handleFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await uploadEnvContent(await file.text());
  }

  // ---------- exportar ----------

  async function downloadEnvFile() {
    const response = await fetch('?/exportSecrets', {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body: new FormData(),
    });
    const result = deserialize(await response.text());

    if (result.type !== 'success' || !result.data) {
      toast.error(
        'No se pudieron exportar los secretos',
        result.type === 'failure' && result.data?.error ? String(result.data.error) : undefined,
      );
      return;
    }

    const { content, filename } = result.data as { content: string; filename: string };
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Archivo descargado', filename);
  }

  // ---------- modales ----------

  let createSecretOpen = $state(false);
  let editSecretOpen = $state(false);
  let deleteSecretOpen = $state(false);
  let deleteFolderOpen = $state(false);
  let createFolderOpen = $state(false);
  let linkFolderOpen = $state(false);
  let importOpen = $state(false);
  let copyEnvOpen = $state(false);
  let submitting = $state(false);

  let newSecretKey = $state('');
  let newSecretValue = $state('');
  let newSecretVisible = $state(false);

  let editingSecret = $state<VaultSecret | null>(null);
  let editSecretKey = $state('');
  let editSecretDescription = $state('');
  let editSecretValues = $state<Record<string, string>>({});
  let editSecretVisible = $state(false);

  let deletingSecret = $state<VaultSecret | null>(null);
  let deletingFolder = $state<VaultFolder | null>(null);

  let newFolderName = $state('');
  let linkedFolderPath = $state('');
  let importContent = $state('');
  let copySourceSlug = $state('');

  function openCreateSecret() {
    newSecretKey = '';
    newSecretValue = '';
    newSecretVisible = false;
    createSecretOpen = true;
  }

  function openEditSecret(secret: VaultSecret) {
    editingSecret = secret;
    editSecretKey = secret.key;
    editSecretDescription = secret.description ?? '';
    editSecretVisible = false;
    editSecretValues = Object.fromEntries(
      data.environments.map((candidate) => [candidate.slug, secret.values?.[candidate.slug] ?? '']),
    );
    editSecretOpen = true;
  }

  function openDeleteSecret(secret: VaultSecret) {
    deletingSecret = secret;
    deleteSecretOpen = true;
  }

  function openDeleteFolder(folder: VaultFolder) {
    deletingFolder = folder;
    deleteFolderOpen = true;
  }

  function openCreateFolder() {
    newFolderName = '';
    createFolderOpen = true;
  }

  function openLinkFolder() {
    linkedFolderPath = '';
    linkFolderOpen = true;
  }

  function openImportSecrets() {
    importContent = '';
    importOpen = true;
  }

  function openCopyEnvironment() {
    copySourceSlug = otherEnvironments[0]?.slug ?? '';
    copyEnvOpen = true;
  }

  function closeModals() {
    createSecretOpen = false;
    editSecretOpen = false;
    deleteSecretOpen = false;
    deleteFolderOpen = false;
    createFolderOpen = false;
    linkFolderOpen = false;
    importOpen = false;
    copyEnvOpen = false;
  }

  const submitWith =
    (success: () => [string, string?]): SubmitFunction =>
    () => {
      submitting = true;
      const [title, description] = success();
      return async ({ result, update }) => {
        submitting = false;
        if (result.type === 'success') {
          closeModals();
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
</script>

<svelte:head>
  <title>Vault - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">Secretos</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Variables cifradas por entorno de {data.project?.name ?? projectSlug}. Cada cambio queda
        como un commit en GitDB.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-icon"
        onclick={downloadEnvFile}
        aria-label="Descargar .env"
        title="Descargar .env"
      >
        <Download class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-icon"
        onclick={toggleRevealAll}
        disabled={visibleSecrets.length === 0}
        aria-label={allRevealed ? 'Ocultar valores' : 'Mostrar valores'}
        title={allRevealed ? 'Ocultar valores' : 'Mostrar valores'}
      >
        {#if allRevealed}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
      </button>

      {#if data.canManageSecrets}
        <div class="flex">
          <button
            type="button"
            class="k-btn k-btn-primary rounded-r-none"
            onclick={openCreateSecret}
          >
            <Plus class="h-4 w-4" />Nuevo secreto
          </button>
          <DropdownMenu label="Más acciones" align="end">
            {#snippet trigger(props)}
              <button
                class="k-btn k-btn-primary k-btn-icon rounded-l-none border-l border-black/25"
                aria-label="Más acciones"
                {...props}
              >
                <ChevronDown class="h-4 w-4" />
              </button>
            {/snippet}
            <MenuItem icon={FolderPlus} onclick={openCreateFolder}>Nueva carpeta</MenuItem>
            <MenuItem icon={Link2} onclick={openLinkFolder}>Enlazar carpeta</MenuItem>
            <MenuItem icon={Upload} onclick={openImportSecrets}>Importar .env</MenuItem>
            <MenuItem
              icon={CopyPlus}
              disabled={otherEnvironments.length === 0}
              onclick={openCopyEnvironment}>Copiar desde otro entorno</MenuItem
            >
          </DropdownMenu>
        </div>
      {/if}
    </div>
  </header>

  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex min-w-0 flex-wrap items-center gap-3">
      {#if data.environments.length > 0}
        <div class="max-w-full overflow-x-auto">
          <Tabs
            variant="segmented"
            label="Entorno"
            value={environmentSlug}
            items={data.environments.map((candidate) => ({
              value: candidate.slug,
              label: candidate.name,
            }))}
            onchange={selectEnvironment}
          />
        </div>
      {/if}

      <nav class="flex min-w-0 items-center gap-1 text-sm text-fg-subtle" aria-label="Carpeta">
        <a
          href={vaultUrl('/')}
          class="rounded px-1 font-mono hover:text-white"
          aria-current={currentPath === '/' ? 'page' : undefined}>/</a
        >
        {#each pathSegments as segment, index (segment.path)}
          {#if index > 0}<ChevronRight class="h-3.5 w-3.5 shrink-0" />{/if}
          {#if index === pathSegments.length - 1}
            <span class="truncate font-mono text-white" aria-current="page">{segment.name}</span>
          {:else}
            <a
              href={vaultUrl(segment.path)}
              class="truncate rounded px-1 font-mono hover:text-white">{segment.name}</a
            >
          {/if}
        {/each}
      </nav>
    </div>

    <div class="relative w-full lg:max-w-xs">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Buscar clave o carpeta"
        aria-label="Buscar clave o carpeta"
        class="k-input h-9 pl-9"
      />
    </div>
  </div>

  {#if isProduction && data.canManageSecrets}
    <div
      class="flex items-center gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/6 px-3 py-2 text-xs text-amber-200"
    >
      <TriangleAlert class="h-4 w-4 shrink-0 text-amber-400" />Estás editando el entorno
      {environmentName}: los cambios afectan a producción.
    </div>
  {/if}

  <div
    class="k-card overflow-hidden transition-colors {dropActive
      ? 'border-brand-500/60 bg-brand-500/5'
      : ''}"
    role="region"
    aria-label="Secretos de {environmentName}"
    ondragenter={data.canManageSecrets ? handleDragOver : undefined}
    ondragover={data.canManageSecrets ? handleDragOver : undefined}
    ondragleave={data.canManageSecrets ? handleDragLeave : undefined}
    ondrop={data.canManageSecrets ? handleDrop : undefined}
  >
    {#if isEmpty && !currentFolderId}
      <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-white/4 text-2xl">🦊</span>
        <p class="text-sm font-medium text-white">Aún no hay secretos en {environmentName}</p>
        <p class="max-w-sm text-sm text-fg-muted">
          {#if data.canManageSecrets}
            Crea el primero, arrastra aquí un archivo <span class="font-mono">.env</span> o copia los
            valores de otro entorno.
          {:else}
            Cuando alguien del proyecto añada secretos, aparecerán aquí.
          {/if}
        </p>
        {#if data.canManageSecrets}
          <div class="mt-1 flex flex-wrap justify-center gap-2">
            <button type="button" class="k-btn k-btn-primary k-btn-sm" onclick={openCreateSecret}>
              <Plus class="h-3.5 w-3.5" />Nuevo secreto
            </button>
            <button
              type="button"
              class="k-btn k-btn-secondary k-btn-sm"
              onclick={() => fileInput?.click()}
            >
              <FileUp class="h-3.5 w-3.5" />Subir .env
            </button>
            {#if otherEnvironments.length > 0}
              <button
                type="button"
                class="k-btn k-btn-secondary k-btn-sm"
                onclick={openCopyEnvironment}
              >
                <CopyPlus class="h-3.5 w-3.5" />Copiar de otro entorno
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">Clave</th>
              <th class="px-3 py-3 font-semibold">Valor · {environmentSlug}</th>
              <th class="px-5 py-3"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#if currentFolderId}
              <tr
                class="cursor-pointer transition-colors hover:bg-white/2.5"
                onclick={() => goToFolder(parentFolder)}
              >
                <td class="px-5 py-3" colspan="3">
                  <a
                    href={vaultUrl(parentFolder?.path ?? '/')}
                    class="inline-flex items-center gap-2 text-fg-muted hover:text-white"
                    onclick={(event) => event.stopPropagation()}
                  >
                    <CornerLeftUp class="h-4 w-4" />
                    <span class="font-mono">..</span>
                  </a>
                </td>
              </tr>
            {/if}

            {#each filteredFolders as folder (folder.id)}
              {@const linkTarget = folder.linkedFolderId ? linkedPath(folder) : null}
              <tr
                class="group cursor-pointer transition-colors hover:bg-white/2.5"
                onclick={() => goToFolder(folder)}
              >
                <td class="px-5 py-3" colspan="2">
                  <a
                    href={vaultUrl(folder.path)}
                    class="inline-flex min-w-0 items-center gap-2.5"
                    onclick={(event) => event.stopPropagation()}
                  >
                    <span
                      class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/4 text-fg-muted group-hover:text-brand-400"
                    >
                      {#if folder.linkedFolderId}<Link2 class="h-3.5 w-3.5" />{:else}<Folder
                          class="h-3.5 w-3.5"
                        />{/if}
                    </span>
                    <span class="truncate font-medium text-white">{folder.name}</span>
                    {#if linkTarget}
                      <span class="k-badge k-badge-info font-mono">→ {linkTarget}</span>
                    {/if}
                  </a>
                </td>
                <td class="px-5 py-3">
                  <div class="flex items-center justify-end gap-1">
                    {#if data.canDeleteSecrets}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                        aria-label="Borrar carpeta {folder.name}"
                        onclick={(event) => {
                          event.stopPropagation();
                          openDeleteFolder(folder);
                        }}
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                    <ChevronRight
                      class="h-4 w-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400"
                    />
                  </div>
                </td>
              </tr>
            {/each}

            {#each filteredSecrets as secret (secret.id)}
              {@const value = secret.values?.[environmentSlug]}
              {@const shown = revealed[revealKey(secret)]}
              <tr class="transition-colors hover:bg-white/2.5">
                <td class="px-5 py-3 align-top">
                  <p class="font-mono text-[13px] font-medium text-white">{secret.key}</p>
                  {#if secret.description}
                    <p
                      class="mt-0.5 max-w-sm truncate text-xs text-fg-subtle"
                      title={secret.description}
                    >
                      {secret.description}
                    </p>
                  {/if}
                </td>
                <td class="px-3 py-3 align-top">
                  {#if !value}
                    <span class="k-badge k-badge-warn">Sin valor</span>
                  {:else}
                    <button
                      type="button"
                      class="block max-w-72 truncate rounded text-left font-mono text-[13px] {shown
                        ? 'text-fg'
                        : 'tracking-widest text-fg-subtle'} hover:text-white"
                      onclick={() => toggleReveal(secret)}
                      title={shown ? 'Ocultar valor' : 'Mostrar valor'}
                    >
                      {shown ? value : '••••••••••••'}
                    </button>
                  {/if}
                </td>
                <td class="px-5 py-2.5 align-top">
                  <div class="flex items-center justify-end gap-1">
                    {#if value}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                        aria-label={shown ? `Ocultar ${secret.key}` : `Mostrar ${secret.key}`}
                        onclick={() => toggleReveal(secret)}
                      >
                        {#if shown}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye
                            class="h-3.5 w-3.5"
                          />{/if}
                      </button>
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                        aria-label="Copiar {secret.key}"
                        onclick={() => copyValue(secret)}
                      >
                        <Copy class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                    {#if data.canManageSecrets}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                        aria-label="Editar {secret.key}"
                        onclick={() => openEditSecret(secret)}
                      >
                        <Pencil class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                    {#if data.canDeleteSecrets}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                        aria-label="Borrar {secret.key}"
                        onclick={() => openDeleteSecret(secret)}
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}

            {#if filteredFolders.length === 0 && filteredSecrets.length === 0}
              <tr>
                <td class="px-5 py-10 text-center text-sm text-fg-subtle" colspan="3">
                  {query
                    ? `Nada coincide con «${searchQuery.trim()}».`
                    : 'Esta carpeta está vacía.'}
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      {#if data.canManageSecrets}
        <div
          class="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t border-dashed border-white/10 px-5 py-4 text-xs text-fg-subtle"
        >
          <FileUp class="h-3.5 w-3.5" />
          Arrastra aquí un archivo <span class="font-mono">.env</span>, o
          <button
            type="button"
            class="font-medium text-brand-400 hover:text-brand-300"
            onclick={() => fileInput?.click()}>elígelo</button
          >
          {#if otherEnvironments.length > 0}
            · <button
              type="button"
              class="font-medium text-brand-400 hover:text-brand-300"
              onclick={openCopyEnvironment}>copia de otro entorno</button
            >
          {/if}
        </div>
      {/if}
    {/if}

    {#if dropActive}
      <p class="sr-only" aria-live="polite">
        Suelta el archivo para importarlo en {environmentName}
      </p>
    {/if}
  </div>

  {#if data.canManageSecrets}
    <input
      bind:this={fileInput}
      type="file"
      accept=".env,text/plain"
      class="hidden"
      onchange={handleFilePicked}
    />
  {/if}
</div>

<!-- ================= MODALES ================= -->

<Modal
  bind:open={createSecretOpen}
  title="Nuevo secreto"
  description="Se cifra antes de guardarse en GitDB, en {environmentName} · {currentPath}."
  dismissible={!submitting}
>
  <form
    id="form-crear-secreto"
    method="POST"
    action="?/createSecret"
    class="space-y-5"
    use:enhance={submitWith(() => ['Secreto creado', `${newSecretKey} · ${environmentSlug}`])}
  >
    <input type="hidden" name="folderId" value={currentFolderId ?? ''} />
    <Field
      label="Clave"
      help={data.capitalizeSecrets
        ? 'Se guarda en mayúsculas. Por ejemplo: STRIPE_SECRET_KEY'
        : 'Por ejemplo: STRIPE_SECRET_KEY'}
      required
    >
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="key"
          placeholder="DATABASE_URL"
          autocomplete="off"
          spellcheck="false"
          data-autofocus
          value={newSecretKey}
          oninput={(event) => (newSecretKey = normalizeKey(event.currentTarget.value))}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label="Valor en {environmentName}">
      {#snippet children(control)}
        <div class="relative">
          <input
            class="k-input pr-10 font-mono text-[13px]"
            type={newSecretVisible ? 'text' : 'password'}
            name="value:{environmentSlug}"
            placeholder="••••••••"
            autocomplete="off"
            spellcheck="false"
            bind:value={newSecretValue}
            {...control}
          />
          <button
            type="button"
            class="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-white/5 hover:text-white"
            aria-label={newSecretVisible ? 'Ocultar valor' : 'Mostrar valor'}
            onclick={() => (newSecretVisible = !newSecretVisible)}
          >
            {#if newSecretVisible}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
          </button>
        </div>
      {/snippet}
    </Field>
    {#if isProduction}
      <div
        class="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/6 p-3 text-xs text-amber-200"
      >
        <TriangleAlert class="h-4 w-4 shrink-0 text-amber-400" />Vas a guardar un secreto de
        producción.
      </div>
    {/if}
  </form>
  {#snippet footer()}
    <span class="mr-auto hidden items-center gap-1 text-xs text-fg-subtle sm:flex"
      ><span class="k-kbd">Esc</span> para cerrar</span
    >
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createSecretOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-crear-secreto"
      class="k-btn k-btn-primary"
      disabled={submitting || !newSecretKey.trim()}>Guardar secreto</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={editSecretOpen}
  title="Editar secreto"
  description="Cambia la clave, la descripción o el valor en {environmentName}."
  dismissible={!submitting}
>
  {#if editingSecret}
    <form
      id="form-editar-secreto"
      method="POST"
      action="?/updateSecret"
      class="space-y-5"
      use:enhance={submitWith(() => ['Secreto guardado', `${editSecretKey} · ${environmentSlug}`])}
    >
      <input type="hidden" name="id" value={editingSecret.id} />
      <input type="hidden" name="folderId" value={editingSecret.folderId ?? ''} />
      {#each otherEnvironments as other (other.id)}
        <input type="hidden" name="value:{other.slug}" value={editSecretValues[other.slug] ?? ''} />
      {/each}
      <Field label="Clave" required>
        {#snippet children(control)}
          <input
            class="k-input font-mono text-[13px]"
            name="key"
            autocomplete="off"
            spellcheck="false"
            value={editSecretKey}
            oninput={(event) => (editSecretKey = normalizeKey(event.currentTarget.value))}
            {...control}
          />
        {/snippet}
      </Field>
      <Field label="Valor en {environmentName}">
        {#snippet children(control)}
          <div class="relative">
            <input
              class="k-input pr-10 font-mono text-[13px]"
              type={editSecretVisible ? 'text' : 'password'}
              name="value:{environmentSlug}"
              autocomplete="off"
              spellcheck="false"
              data-autofocus
              bind:value={editSecretValues[environmentSlug]}
              {...control}
            />
            <button
              type="button"
              class="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-white/5 hover:text-white"
              aria-label={editSecretVisible ? 'Ocultar valor' : 'Mostrar valor'}
              onclick={() => (editSecretVisible = !editSecretVisible)}
            >
              {#if editSecretVisible}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
            </button>
          </div>
        {/snippet}
      </Field>
      <Field label="Descripción" help="Para qué sirve; se muestra bajo la clave.">
        {#snippet aside()}Opcional{/snippet}
        {#snippet children(control)}
          <textarea
            class="k-input"
            name="description"
            rows="3"
            bind:value={editSecretDescription}
            {...control}></textarea>
        {/snippet}
      </Field>
    </form>
  {/if}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (editSecretOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-editar-secreto"
      class="k-btn k-btn-primary"
      disabled={submitting || !editSecretKey.trim()}>Guardar cambios</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={deleteSecretOpen}
  role="alertdialog"
  size="sm"
  dismissible={!submitting}
  title="¿Borrar el secreto?"
  description="Se borrará {deletingSecret?.key ??
    ''} en todos los entornos. Quedará un commit en GitDB, pero no se puede deshacer desde la interfaz."
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <form
      id="form-borrar-secreto"
      method="POST"
      action="?/deleteSecret"
      hidden
      use:enhance={submitWith(() => ['Secreto borrado', deletingSecret?.key])}
    >
      <input type="hidden" name="id" value={deletingSecret?.id ?? ''} />
    </form>
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteSecretOpen = false)}
      >Cancelar</button
    >
    <button
      form="form-borrar-secreto"
      class="k-btn k-btn-danger"
      disabled={submitting}
      data-autofocus>Borrar secreto</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={deleteFolderOpen}
  role="alertdialog"
  size="sm"
  dismissible={!submitting}
  title="¿Borrar la carpeta?"
  description="Se borrará {deletingFolder?.path ??
    ''}. Tiene que estar vacía: sin secretos, subcarpetas ni enlaces que apunten a ella."
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <form
      id="form-borrar-carpeta"
      method="POST"
      action="?/deleteFolder"
      hidden
      use:enhance={submitWith(() => ['Carpeta borrada', deletingFolder?.path])}
    >
      <input type="hidden" name="id" value={deletingFolder?.id ?? ''} />
    </form>
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteFolderOpen = false)}
      >Cancelar</button
    >
    <button
      form="form-borrar-carpeta"
      class="k-btn k-btn-danger"
      disabled={submitting}
      data-autofocus>Borrar carpeta</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={createFolderOpen}
  size="sm"
  title="Nueva carpeta"
  description="Se creará dentro de {currentPath}. Las carpetas son comunes a todos los entornos."
  dismissible={!submitting}
>
  <form
    id="form-crear-carpeta"
    method="POST"
    action="?/createFolder"
    use:enhance={submitWith(() => ['Carpeta creada', newFolderName])}
  >
    <input type="hidden" name="parentFolderId" value={currentFolderId ?? ''} />
    <Field label="Nombre" required>
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="name"
          placeholder="database"
          autocomplete="off"
          data-autofocus
          bind:value={newFolderName}
          {...control}
        />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createFolderOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-crear-carpeta"
      class="k-btn k-btn-primary"
      disabled={submitting || !newFolderName.trim()}
      ><FolderPlus class="h-4 w-4" />Crear carpeta</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={linkFolderOpen}
  title="Enlazar carpeta"
  description="La carpeta enlazada aparece en {currentPath} y sus secretos se heredan aquí sin duplicarlos."
  dismissible={!submitting}
>
  <form
    id="form-enlazar-carpeta"
    method="POST"
    action="?/linkFolder"
    use:enhance={submitWith(() => ['Carpeta enlazada', linkedFolderPath])}
  >
    <input type="hidden" name="parentFolderId" value={currentFolderId ?? ''} />
    <Field label="Ruta a enlazar" help="Ruta absoluta de una carpeta existente." required>
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="linkedPath"
          placeholder="/common/database"
          autocomplete="off"
          list="vault-folder-paths"
          data-autofocus
          bind:value={linkedFolderPath}
          {...control}
        />
      {/snippet}
    </Field>
    <datalist id="vault-folder-paths">
      {#each data.folders.filter((folder) => !folder.linkedFolderId) as folder (folder.id)}
        <option value={folder.path}></option>
      {/each}
    </datalist>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (linkFolderOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-enlazar-carpeta"
      class="k-btn k-btn-primary"
      disabled={submitting || !linkedFolderPath.trim()}><Link2 class="h-4 w-4" />Enlazar</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={importOpen}
  size="lg"
  title="Importar .env"
  description="Pega el contenido de un archivo .env. Se importa en {environmentName} · {currentPath}."
  dismissible={!submitting}
>
  <form
    id="form-importar"
    method="POST"
    action="?/importSecrets"
    use:enhance={submitWith(() => ['Secretos importados', `${environmentName} · ${currentPath}`])}
  >
    <input type="hidden" name="folderId" value={currentFolderId ?? ''} />
    <input type="hidden" name="environmentSlug" value={environmentSlug} />
    <Field label="Contenido" required>
      {#snippet children(control)}
        <textarea
          class="k-input font-mono text-[13px]"
          name="content"
          rows="10"
          spellcheck="false"
          placeholder={'API_KEY=123\nDATABASE_URL=postgres://...'}
          data-autofocus
          bind:value={importContent}
          {...control}></textarea>
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button
      type="button"
      class="k-btn k-btn-ghost mr-auto"
      onclick={() => {
        importOpen = false;
        fileInput?.click();
      }}><FileUp class="h-4 w-4" />Subir archivo</button
    >
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (importOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-importar"
      class="k-btn k-btn-primary"
      disabled={submitting || !importContent.trim()}><Upload class="h-4 w-4" />Importar</button
    >
  {/snippet}
</Modal>

<Modal
  bind:open={copyEnvOpen}
  size="sm"
  title="Copiar desde otro entorno"
  description="Copia los valores de los secretos de {currentPath} hacia {environmentName}."
  dismissible={!submitting}
>
  <form
    id="form-copiar-entorno"
    method="POST"
    action="?/copyEnvironment"
    class="space-y-4"
    use:enhance={submitWith(() => ['Valores copiados', `${copySourceSlug} → ${environmentSlug}`])}
  >
    <input type="hidden" name="folderId" value={currentFolderId ?? ''} />
    <Field label="Entorno de origen" required>
      {#snippet children(control)}
        <select
          class="k-input"
          name="sourceEnvironment"
          data-autofocus
          bind:value={copySourceSlug}
          {...control}
        >
          {#each otherEnvironments as other (other.id)}
            <option value={other.slug}>{other.name}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
    {#if isProduction}
      <div
        class="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/6 p-3 text-xs text-amber-200"
      >
        <TriangleAlert class="h-4 w-4 shrink-0 text-amber-400" />El destino es producción. Revisa
        los valores antes de desplegar.
      </div>
    {/if}
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (copyEnvOpen = false)}
      >Cancelar</button
    >
    <button
      type="submit"
      form="form-copiar-entorno"
      class="k-btn k-btn-primary"
      disabled={submitting || !copySourceSlug}><CopyPlus class="h-4 w-4" />Copiar</button
    >
  {/snippet}
</Modal>
