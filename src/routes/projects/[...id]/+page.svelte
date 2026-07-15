<script lang="ts">
  import {
    Box,
    Package,
    Server,
    Code,
    Layers,
    Search,
    History,
    Clock,
    Settings,
  } from 'lucide-svelte';
  import SubNavbar from '$lib/components/SubNavbar.svelte';
  import ResourceTree from '$lib/components/ResourceTree.svelte';
  import OutputsViewer from '$lib/components/OutputsViewer.svelte';

  export let data: any;

  let resourceRoots: any[] = [];
  let filteredResourceRoots: any[] = [];
  let stackOutputs: Record<string, any> = {};
  let environmentConfig: Record<string, any> = {};
  let selectedResource: any = null;
  let resourceSearchQuery = '';
  let activeTab: 'resources' | 'configuration' | 'outputs' | 'history' = 'resources';

  $: {
    if (data.isHistorical && activeTab === 'history') {
      activeTab = 'resources';
    }
  }

  $: if (data.state) {
    const resources = data.state.checkpoint?.latest?.resources || [];
    const stackResource = resources.find(
      (resource: any) => resource.type === 'pulumi:pulumi:Stack',
    );

    if (stackResource?.outputs) {
      stackOutputs = stackResource.outputs;
    }

    const map = new Map<string, any>();
    const roots: any[] = [];

    resources.forEach((resource: any) => {
      map.set(resource.urn, { ...resource, children: [] });
    });

    resources.forEach((resource: any) => {
      const node = map.get(resource.urn);
      if (resource.parent && map.has(resource.parent)) {
        map.get(resource.parent).children.push(node);
      } else {
        roots.push(node);
      }
    });

    resourceRoots = roots;
  }

  $: if (data.history && data.history.length > 0) {
    environmentConfig = data.history[0]?.config || {};
  }

  $: {
    if (resourceSearchQuery.trim() === '') {
      filteredResourceRoots = resourceRoots.map((resource) => resetForceExpand(resource));
    } else {
      filteredResourceRoots = filterTree(resourceRoots, resourceSearchQuery);
    }
  }

  function resetForceExpand(node: any): any {
    return {
      ...node,
      _forceExpand: false,
      children: (node.children || []).map(resetForceExpand),
    };
  }

  function filterTree(roots: any[], query: string) {
    if (!query) return roots;
    const normalizedQuery = query.toLowerCase();

    function processNode(node: any): any | null {
      const matches =
        (node.urn || '').toLowerCase().includes(normalizedQuery) ||
        (node.type || '').toLowerCase().includes(normalizedQuery);
      const filteredChildren = [] as any[];

      if (node.children) {
        for (const child of node.children) {
          const processed = processNode(child);
          if (processed) filteredChildren.push(processed);
        }
      }

      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
          _forceExpand: true,
        };
      }

      return null;
    }

    const result = [] as any[];
    for (const root of roots) {
      const processed = processNode(root);
      if (processed) result.push(processed);
    }
    return result;
  }

  function getStackName(cleanId: string) {
    return cleanId || 'Unknown Stack';
  }

  function handleSelect(event: CustomEvent) {
    selectedResource = event.detail;
  }

  function formatDate(unixTimestamp: number) {
    if (!unixTimestamp) return '';
    return new Date(unixTimestamp * 1000).toLocaleString();
  }

  function selectBackend(event: CustomEvent<{ id: string }>) {
    document.cookie = `active_backend=${event.detail.id}; path=/; max-age=31536000`;
    window.location.href = '/pulumi-state';
  }
</script>

<svelte:head>
  <title>{getStackName(data.cleanId || '')} - Pulumi State UI</title>
</svelte:head>

<SubNavbar
  label="State"
  options={data.backends || []}
  activeId={data.activeBackendId || ''}
  path={`/${data.cleanId || ''}`}
  on:change={selectBackend}
/>

{#if data.error}
  <div class="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200">
    <h3 class="font-bold text-lg mb-2">Failed to load Stack</h3>
    <p>{data.error}</p>
  </div>
{:else if data.state}
  {#if data.isHistorical}
    <div
      class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-amber-800 gap-4"
    >
      <div class="flex items-center gap-3">
        <History class="w-6 h-6 text-amber-600 shrink-0" />
        <div>
          <h3 class="font-bold text-base">Historical State View</h3>
          <p class="text-sm text-amber-700 mt-0.5">
            You are inspecting a checkpoint from the past. The data below does not represent the
            current live state.
          </p>
        </div>
      </div>
      <a
        href="/pulumi-state/{data.cleanId}"
        class="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-bold rounded-lg transition-colors whitespace-nowrap text-center"
        >Return to Current State</a
      >
    </div>
  {/if}

  <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
    <div>
      <h2 class="text-3xl font-bold text-gray-900">{getStackName(data.cleanId)}</h2>
      <p class="text-sm text-gray-500 mt-1 font-mono">Actual file: {data.key}</p>
    </div>
    <div class="flex gap-4">
      <div class="text-right">
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Resources</p>
        <p class="text-xl font-bold text-gray-900">
          {data.state?.checkpoint?.latest?.resources?.length || 0}
        </p>
      </div>
      <div class="text-right pl-4 border-l border-gray-200">
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Version</p>
        <p class="text-xl font-bold text-gray-900">{data.state.version}</p>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
    <div class="lg:col-span-3 space-y-6">
      <div class="flex items-center gap-6 border-b border-gray-200 overflow-x-auto">
        <button
          on:click={() => (activeTab = 'resources')}
          class="pb-3 text-sm font-semibold whitespace-nowrap {activeTab === 'resources'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'}"
          >{data.isHistorical ? 'Checkpoint State' : 'Current State'}</button
        >
        <button
          on:click={() => (activeTab = 'configuration')}
          class="pb-3 text-sm font-semibold whitespace-nowrap {activeTab === 'configuration'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'}">Configuration</button
        >
        <button
          on:click={() => (activeTab = 'outputs')}
          class="pb-3 text-sm font-semibold whitespace-nowrap {activeTab === 'outputs'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'}">Outputs</button
        >
        <button
          on:click={() => (activeTab = 'history')}
          class="pb-3 text-sm font-semibold whitespace-nowrap {activeTab === 'history'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'} flex items-center gap-1.5"
          ><History class="w-4 h-4" /> Activity History</button
        >
      </div>

      {#if activeTab === 'resources'}
        <div class="space-y-8 animate-in fade-in duration-200">
          <section>
            <div
              class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 pb-3 mb-4 gap-3"
            >
              <h3 class="text-lg font-bold text-gray-900">Resources</h3>
              <div class="flex items-center gap-3">
                <div class="relative">
                  <Search
                    class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    bind:value={resourceSearchQuery}
                    placeholder="Search URN or type..."
                    class="w-full sm:w-64 pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  />
                </div>
                <span
                  class="hidden sm:inline-block text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded whitespace-nowrap"
                  >Tree View</span
                >
              </div>
            </div>

            <div
              class="bg-white border border-gray-200 rounded-xl p-2 sm:p-4 shadow-sm overflow-x-auto min-h-[400px]"
            >
              {#if filteredResourceRoots.length > 0}
                {#each filteredResourceRoots as rootNode}
                  <ResourceTree
                    node={rootNode}
                    level={0}
                    selectedUrn={selectedResource?.urn || ''}
                    on:select={handleSelect}
                  />
                {/each}
              {:else}
                <p class="text-gray-500 text-sm p-4">No resources match your search.</p>
              {/if}
            </div>
          </section>
        </div>
      {:else if activeTab === 'configuration'}
        <div
          class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-200"
        >
          {#if Object.keys(environmentConfig).length > 0}
            <div class="p-5"><OutputsViewer outputs={environmentConfig} /></div>
          {:else}
            <div class="p-12 text-center text-gray-500 flex flex-col items-center">
              <Settings class="w-12 h-12 mb-3 text-gray-300" />
              <p>No environment configuration found.</p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'outputs'}
        <div
          class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-200"
        >
          {#if Object.keys(stackOutputs).length > 0}
            <div class="p-5"><OutputsViewer outputs={stackOutputs} /></div>
          {:else}
            <div class="p-12 text-center text-gray-500 flex flex-col items-center">
              <Box class="w-12 h-12 mb-3 text-gray-300" />
              <p>No stack outputs found.</p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'history'}
        <div
          class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-200"
        >
          {#if data.history && data.history.length > 0}
            <div class="divide-y divide-gray-100">
              {#each data.history as update}
                <div class="p-5 hover:bg-gray-50 transition-colors">
                  <div class="flex items-start justify-between mb-2">
                    <div>
                      <div class="flex items-center gap-2 mb-1">
                        <span
                          class="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider {update.result ===
                          'succeeded'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'}">{update.result}</span
                        >
                        <span class="text-sm font-semibold text-gray-900 capitalize"
                          >{update.kind || 'update'}</span
                        >
                      </div>
                      <h4 class="text-base font-bold text-gray-900">
                        {update.message || 'No update message'}
                      </h4>
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="text-right text-sm text-gray-500 flex flex-col items-end gap-1">
                        <span class="flex items-center gap-1"
                          ><Clock class="w-4 h-4" /> {formatDate(update.startTime)}</span
                        >
                        {#if update.environment && update.environment['git.author']}
                          <span class="text-xs"
                            >by <span class="font-medium text-gray-700"
                              >{update.environment['git.author']}</span
                            ></span
                          >
                        {/if}
                      </div>
                      {#if update.key}
                        <a
                          href="?checkpoint={encodeURIComponent(
                            update.key.replace('.history.json', '.checkpoint.json'),
                          )}"
                          class="px-3 py-1.5 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <Search class="w-3 h-3" /> Inspect State
                        </a>
                      {/if}
                    </div>
                  </div>
                  {#if update.resourceChanges}
                    <div class="mt-4 flex gap-3 text-xs">
                      {#each Object.entries(update.resourceChanges) as [operation, count]}
                        <div
                          class="px-2 py-1 rounded bg-gray-100 text-gray-700 font-medium capitalize"
                        >
                          {operation}: <span class="font-bold">{count}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="p-12 text-center text-gray-500 flex flex-col items-center">
              <History class="w-12 h-12 mb-3 text-gray-300" />
              <p>No history found for this stack.</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="lg:col-span-2 space-y-6">
      <div
        class="bg-white rounded-xl border border-gray-200 shadow-sm sticky top-24 overflow-hidden flex flex-col h-[calc(100vh-8rem)]"
      >
        <div class="bg-gray-50 border-b border-gray-200 px-5 py-4">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <Server class="w-5 h-5 text-blue-600" /> Resource Inspector
          </h3>
        </div>

        <div class="p-5 flex-1 overflow-y-auto">
          {#if selectedResource}
            <div class="mb-4">
              <span
                class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold {selectedResource.custom
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'} mb-3"
              >
                {#if selectedResource.custom}
                  <Box class="w-3 h-3 mr-1" /> Custom Resource
                {:else}
                  <Package class="w-3 h-3 mr-1" /> Component Resource
                {/if}
              </span>
              <h4 class="text-lg font-bold text-gray-900 break-all leading-tight">
                {selectedResource.urn.split('::').pop()}
              </h4>
            </div>

            <div class="space-y-4">
              <div>
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Type
                </p>
                <p class="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-800 break-all">
                  {selectedResource.type}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">URN</p>
                <p
                  class="text-xs font-mono text-gray-500 break-all bg-gray-50 border border-gray-200 p-2 rounded-lg"
                >
                  {selectedResource.urn}
                </p>
              </div>
              {#if selectedResource.provider}
                <div>
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Provider
                  </p>
                  <p class="text-xs font-mono text-gray-500 break-all">
                    {selectedResource.provider.split('::')[0]}
                  </p>
                </div>
              {/if}
              <hr class="border-gray-200 my-4" />
              {#if selectedResource.inputs && Object.keys(selectedResource.inputs).length > 0}
                <div class="mb-4">
                  <p class="text-sm font-bold flex items-center gap-2 text-gray-900 mb-2">
                    <Code class="w-4 h-4 text-purple-600" /> Inputs
                  </p>
                  <OutputsViewer outputs={selectedResource.inputs} />
                </div>
              {/if}
              {#if selectedResource.outputs && Object.keys(selectedResource.outputs).length > 0}
                <div>
                  <p class="text-sm font-bold flex items-center gap-2 text-gray-900 mb-2">
                    <Layers class="w-4 h-4 text-green-600" /> Outputs
                  </p>
                  <OutputsViewer outputs={selectedResource.outputs} />
                </div>
              {/if}
            </div>
          {:else}
            <div class="h-full flex flex-col items-center justify-center text-gray-400">
              <Box class="w-12 h-12 mb-3 text-gray-200" />
              <p class="text-center text-sm">
                Select a resource from the tree to view its details.
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
