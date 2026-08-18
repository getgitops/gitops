<script lang="ts">
  import {
    Search,
    Layers,
    ArrowRight,
    Lock,
    Unlock,
    X,
    Copy,
    Check,
    HelpCircle,
    RefreshCw,
    Edit2,
    Trash2,
  } from 'lucide-svelte';
  import SubNavbar from '$lib/components/SubNavbar.svelte';
  import { invalidateAll } from '$app/navigation';

  export let data: any;

  let searchQuery = '';
  let computedProjects: Record<string, { id: string; name: string; stacks: any[] }> = {};

  $: {
    computedProjects = {};

    if (data.dbProjects) {
      for (const dbProject of data.dbProjects) {
        computedProjects[dbProject.id] = {
          id: dbProject.id,
          name: dbProject.name,
          stacks: [],
        };
      }
    }

    for (const file of data.files || []) {
      const cleanId = getCleanId(file);
      const parts = cleanId.split('/');

      let projectId = 'default';
      let stackId = cleanId;
      let stackName = getStackName(file);

      if (parts.length > 1) {
        projectId = parts[0];
        stackId = parts.slice(1).join('/');
      }

      if (!computedProjects[projectId]) {
        computedProjects[projectId] = {
          id: projectId,
          name: projectId,
          stacks: [],
        };
      }

      const hasLock = (data.locks || []).some((lockFile: string) =>
        lockFile.includes(`/${projectId}/${stackId}/`),
      );

      computedProjects[projectId].stacks.push({
        fileKey: file,
        cleanId,
        stackId,
        stackName,
        isLocked: hasLock,
        summary: (data.stateSummaries as Record<string, any>)?.[file] || { resourceCount: 0 },
      });
    }
  }

  $: filteredProjects = Object.values(computedProjects)
    .filter((project) => {
      const projectMatches =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.id.toLowerCase().includes(searchQuery.toLowerCase());
      const stackMatches = project.stacks.some((stack) =>
        stack.stackName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      return projectMatches || stackMatches;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function getCleanId(fileKey: string) {
    let id = fileKey;
    if (id.startsWith('.pulumi/stacks/')) id = id.replace('.pulumi/stacks/', '');
    if (id.endsWith('.json')) id = id.slice(0, -5);
    return id;
  }

  function getStackName(fileKey: string) {
    return fileKey.split('/').pop()?.replace('.json', '') || fileKey;
  }

  let actionModalType: 'rename' | 'delete' | 'unlock' | null = null;
  let actionProject: any = null;
  let actionStack: any = null;
  let copiedAction = false;
  let isSyncing = false;

  async function syncProjects() {
    isSyncing = true;
    try {
      await fetch('/api/projects/sync', { method: 'POST' });
      await invalidateAll();
    } catch {
      alert('Failed to sync projects');
    } finally {
      isSyncing = false;
    }
  }

  function copyActionCommand() {
    let command = '';
    if (actionModalType === 'rename') {
      command = `# 1. Update the 'name' field in your Pulumi.yaml\n# 2. Rename your stack(s)\npulumi stack rename <new-stack-name> -s ${actionProject?.id}/<old-stack-name>`;
    } else if (actionModalType === 'delete') {
      command = `# 1. Destroy resources (optional but recommended)\npulumi destroy -s ${actionProject?.id}/<stack-name>\n\n# 2. Remove the stack from the backend\npulumi stack rm ${actionProject?.id}/<stack-name> --force`;
    } else if (actionModalType === 'unlock') {
      command = `pulumi cancel -s ${actionProject?.id}/${actionStack?.stackId}`;
    }

    navigator.clipboard.writeText(command);
    copiedAction = true;
    setTimeout(() => (copiedAction = false), 2000);
  }

  function selectBackend(id: string) {
    document.cookie = `active_backend=${id}; path=/; max-age=31536000`;
    window.location.href = '/pulumi-state';
  }
</script>

<svelte:head>
  <title>Projects - Pulumi Open State</title>
</svelte:head>

<SubNavbar
  label="State"
  options={data.backends || []}
  activeId={data.activeBackendId || ''}
  path="/"
  on:change={(event) => selectBackend(event.detail.id)}
/>

<div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
  <div>
    <h2 class="text-2xl font-bold text-gray-900">Projects</h2>
    {#if data.error}
      <p class="text-red-500 text-sm mt-1">Error: {data.error}</p>
    {:else}
      <p class="text-gray-500 text-sm mt-1">
        Found {Object.keys(computedProjects).length} projects across {data.files?.length || 0} states.
      </p>
    {/if}
  </div>

  <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
    <div class="relative w-full sm:w-72 shrink-0">
      <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search projects or stacks..."
        class="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
      />
    </div>
    <button
      on:click={syncProjects}
      disabled={isSyncing}
      class="btn-secondary w-full sm:w-auto font-semibold py-2 px-4 rounded-lg text-sm shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
      title="Sync projects from backend"
    >
      <RefreshCw class="w-4 h-4 {isSyncing ? 'animate-spin text-blue-600' : 'text-gray-500'}" /> Sync
      States
    </button>
    <a
      href="/pulumi-state/cli-guide"
      class="btn-secondary w-full sm:w-auto font-semibold py-2 px-4 rounded-lg text-sm shadow-sm flex items-center justify-center gap-2 shrink-0"
      title="How to connect"
    >
      <HelpCircle class="w-4 h-4 text-gray-500" /> CLI Setup
    </a>
  </div>
</div>

<div class="grid grid-cols-1 gap-6">
  {#each filteredProjects as project}
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div class="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-100 text-blue-700 rounded-lg">
            <Layers class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-lg font-bold text-gray-900 leading-tight">{project.name}</h3>
            <p class="text-xs text-gray-500 font-mono mt-0.5">Project ID: {project.id}</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button
            on:click={() => {
              actionProject = project;
              actionModalType = 'rename';
            }}
            class="btn-ghost p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
            title="Rename Project"
          >
            <Edit2 class="w-4 h-4" />
          </button>
          <button
            on:click={() => {
              actionProject = project;
              actionModalType = 'delete';
            }}
            class="btn-ghost p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
            title="Delete Project"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="p-6">
        {#if project.stacks.length > 0}
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Stacks in this project:</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each project.stacks as stack}
                  <a
                    href={`/pulumi-state/${stack.cleanId}`}
                class="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm transition-all group bg-white"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-bold text-gray-900 group-hover:text-blue-700 truncate text-base">
                    {stack.stackName}
                  </p>
                  <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 font-medium">
                    <span class="flex items-center gap-1.5" title="Resources">
                      <Layers class="w-3.5 h-3.5 text-gray-400" />
                      {stack.summary.resourceCount} resources
                    </span>
                    {#if stack.summary.version}
                      <span class="text-gray-300">•</span>
                      <span title="Pulumi Version">v{stack.summary.version}</span>
                    {/if}
                    {#if stack.isLocked}
                      <span class="text-gray-300">•</span>
                      <span class="flex items-center gap-1 font-bold text-red-600">
                        <Lock class="h-3 w-3" />
                        LOCKED
                      </span>
                    {/if}
                  </div>
                </div>
                {#if stack.isLocked}
                  <button
                    on:click|preventDefault={() => {
                      actionProject = project;
                      actionStack = stack;
                      actionModalType = 'unlock';
                    }}
                    class="btn-ghost p-1.5 text-red-600 rounded-md transition-colors shrink-0 ml-2"
                    title="Unlock Stack"
                  >
                    <Unlock class="h-[18px] w-[18px]" />
                  </button>
                {:else}
                  <div
                    class="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center border border-transparent group-hover:border-blue-200 transition-colors shrink-0 ml-3"
                  >
                    <ArrowRight class="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                  </div>
                {/if}
              </a>
            {/each}
          </div>
        {:else}
          <div class="text-center py-6 text-gray-500">
            <p class="text-sm">No stacks deployed yet.</p>
            <p class="text-xs mt-1">
              Initialize a stack locally using the Pulumi CLI to see it here.
            </p>
          </div>
        {/if}
      </div>
    </div>
  {/each}

  {#if filteredProjects.length === 0 && !data.error}
    <div
      class="py-16 text-center text-gray-500 bg-white border border-dashed border-gray-300 rounded-xl"
    >
      <Layers class="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p class="font-medium text-gray-900">No projects found.</p>
      <p class="text-sm mt-1">Try adjusting your search or create a new project.</p>
    </div>
  {/if}
</div>

{#if actionModalType !== null && actionProject !== null}
  <button
    type="button"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
    on:click={() => (actionModalType = null)}
  >
    <div
      class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
          {#if actionModalType === 'rename'}
            <Edit2 class="w-5 h-5 text-blue-600" /> Rename Project
          {:else}
            <Trash2 class="w-5 h-5 text-red-600" /> Delete Project
          {/if}
        </h3>
        <button
          on:click={() => (actionModalType = null)}
          class="btn-ghost p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-6">
        <div
          class="mb-5 p-4 rounded-xl text-sm border {actionModalType === 'rename'
            ? 'border-blue-200 bg-blue-50 text-blue-800'
            : 'border-red-200 bg-red-50 text-red-800'}"
        >
          {#if actionModalType === 'rename'}
            <p class="font-semibold">Rename Project</p>
            <p class="mt-1">
              Use the Pulumi CLI to rename stack names and update your local Pulumi project
              structure.
            </p>
          {:else}
            <p class="font-semibold">Delete Project</p>
            <p class="mt-1">
              This only removes the local registry entry. The remote state data in your storage
              backend remains untouched.
            </p>
          {/if}
        </div>

        <div class="bg-gray-900 rounded-xl p-1 relative group overflow-hidden">
          <div class="absolute top-3 right-3">
            <button
              on:click={copyActionCommand}
              class="btn-ghost p-1.5 bg-gray-800 text-gray-300 hover:text-white rounded-md transition-colors"
              title="Copy"
            >
              {#if copiedAction}
                <Check class="w-4 h-4 text-green-400" />
              {:else}
                <Copy class="w-4 h-4" />
              {/if}
            </button>
          </div>
          <div class="p-4 text-sm font-mono text-gray-300 overflow-x-auto">
            <pre class="whitespace-pre-wrap">{actionModalType === 'rename'
                ? `# 1. Update the 'name' field in your Pulumi.yaml\n# 2. Rename your stack(s)\npulumi stack rename <new-stack-name> -s ${actionProject?.id}/<old-stack-name>`
                : `# 1. Destroy resources (optional but recommended)\npulumi destroy -s ${actionProject?.id}/<stack-name>\n\n# 2. Remove the stack from the backend\npulumi stack rm ${actionProject?.id}/<stack-name> --force`}</pre>
          </div>
        </div>
      </div>
    </div>
  </button>
{/if}
