<script lang="ts">
  import { onMount } from 'svelte';
  import { RefreshCw, CheckCircle, Plus, Edit2, Trash2, Database, X } from 'lucide-svelte';

  let backends: any[] = [];
  let isLoading = true;
  let isEditing = false;
  let editingId = '';
  let name = '';
  let provider = 's3';
  let bucket = '';
  let region = '';
  let accessKeyId = '';
  let secretAccessKey = '';
  let endpoint = '';
  let gcpProjectId = '';
  let gcpCredentials = '';
  let configError = '';
  let isConnecting = false;
  let saveSuccess = false;
  let isDeleteModalOpen = false;
  let backendToDeleteId = '';
  let backendToDeleteName = '';
  let isDeleting = false;

  onMount(async () => {
    await fetchBackends();
  });

  async function fetchBackends() {
    isLoading = true;
    try {
      const response = await fetch('/api/backends');
      const payload = await response.json();
      backends = payload.backends || [];
    } catch (error) {
      console.error('Error fetching backends', error);
    } finally {
      isLoading = false;
    }
  }

  function startCreate() {
    isEditing = true;
    editingId = '';
    name = '';
    provider = 's3';
    bucket = '';
    region = '';
    accessKeyId = '';
    secretAccessKey = '';
    endpoint = '';
    gcpProjectId = '';
    gcpCredentials = '';
    configError = '';
    saveSuccess = false;
  }

  function startEdit(backend: any) {
    isEditing = true;
    editingId = backend.id;
    name = backend.name || '';
    provider = backend.provider || 's3';
    bucket = backend.bucket || '';
    region = backend.region || '';
    accessKeyId = backend.accessKeyId || '';
    secretAccessKey = backend.secretAccessKey ? '***' : '';
    endpoint = backend.endpoint || '';
    gcpProjectId = backend.gcpProjectId || '';
    gcpCredentials = backend.gcpCredentials ? '***' : '';
    configError = '';
    saveSuccess = false;
  }

  function cancelEdit() {
    isEditing = false;
  }

  function openDeleteModal(backend: any) {
    backendToDeleteId = backend.id;
    backendToDeleteName = backend.name || '';
    isDeleteModalOpen = true;
  }

  function closeDeleteModal() {
    if (isDeleting) return;
    isDeleteModalOpen = false;
    backendToDeleteId = '';
    backendToDeleteName = '';
  }

  async function confirmDeleteBackend() {
    if (!backendToDeleteId) return;

    isDeleting = true;

    try {
      await fetch(`/api/backends/${backendToDeleteId}`, { method: 'DELETE' });
      await fetchBackends();
      isDeleting = false;
      closeDeleteModal();
    } catch {
      alert('Failed to delete backend');
    } finally {
      isDeleting = false;
    }
  }

  async function saveSettings() {
    if (!name) {
      configError = 'Name is required.';
      return;
    }
    if (!bucket) {
      configError = 'Bucket name is required.';
      return;
    }

    isConnecting = true;
    configError = '';
    saveSuccess = false;

    const configPayload: any = {
      id: editingId || undefined,
      name,
      provider,
      bucket,
    };

    if (provider === 's3') {
      Object.assign(configPayload, {
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
      });
    } else {
      Object.assign(configPayload, { gcpProjectId, gcpCredentials });
    }

    try {
      const response = await fetch('/api/backends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      saveSuccess = true;
      setTimeout(() => {
        isEditing = false;
        fetchBackends();
      }, 1000);
    } catch (error: any) {
      configError = error.message;
    } finally {
      isConnecting = false;
    }
  }
</script>

<div class="p-6 sm:p-8">
  <div class="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h3 class="text-xl font-bold text-gray-900">Storage Backends</h3>
      <p class="text-sm text-gray-500 mt-1">Configure where your Pulumi state files are retrieved from.</p>
    </div>
    <button
      on:click={startCreate}
      class="btn-primary font-semibold py-2 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2"
    >
      <Plus class="w-4 h-4" /> Add Backend
    </button>
  </div>
                class="btn-ghost p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
  {#if isLoading}
    <div class="py-12 flex items-center justify-center text-gray-400">
      <RefreshCw class="w-8 h-8 animate-spin" />
    </div>
  {:else if backends.length === 0}
    <div class="border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
      <Database class="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p class="font-medium text-gray-900 mb-1">No backends configured</p>
      <p class="text-sm mb-4">Add your first S3 or GCS bucket to start syncing states.</p>
      <button on:click={startCreate} class="btn-ghost text-blue-600 font-semibold text-sm px-2 py-1 rounded-md"
        >Add Backend →</button
      >
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each backends as backend}
        <div class="border border-gray-200 rounded-xl p-5 bg-white shadow-sm flex flex-col h-full">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h4 class="font-bold text-gray-900">{backend.name}</h4>
              <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-1">
                {backend.provider === 's3' ? 'AWS S3 / Compatible' : 'Google Cloud Storage'}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <button
                on:click={() => startEdit(backend)}
                class="btn-ghost p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                title="Edit"
              >
                <Edit2 class="w-4 h-4" />
              </button>
              <button
                on:click={() => openDeleteModal(backend)}
                class="btn-ghost p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
          <div class="mt-auto pt-4 border-t border-gray-100 text-sm">
            <p class="truncate">
              <span class="text-gray-500">Bucket:</span>
              <span class="font-mono text-gray-900">{backend.bucket}</span>
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if isEditing}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-slate-900/50"
      on:click={cancelEdit}
      aria-label="Close backend modal"
    ></button>

    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Backend configuration modal"
      >
        <div class="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4 flex items-center justify-between">
          <div>
            <h3 class="text-xl font-bold text-gray-900">{editingId ? 'Edit Backend' : 'New Storage Backend'}</h3>
            <p class="text-sm text-gray-500">Enter the connection details for your storage bucket.</p>
          </div>
          <button
            type="button"
            on:click={cancelEdit}
            class="btn-ghost p-2 rounded-md text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Close modal"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-6 p-5 sm:p-6">
      <div>
        <label for="backend-name" class="block text-sm font-semibold text-gray-700 mb-1.5"
          >Connection Name</label
        >
        <input
          id="backend-name"
          type="text"
          bind:value={name}
          class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
          placeholder="e.g. Production AWS"
        />
      </div>

      <div class="pt-4 border-t border-gray-100">
        <label for="provider-select" class="block text-sm font-semibold text-gray-700 mb-1.5"
          >Provider</label
        >
        <select
          id="provider-select"
          bind:value={provider}
          class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
        >
          <option value="s3">AWS S3 / Compatible (MinIO, R2)</option>
          <option value="gcs">Google Cloud Storage (GCS)</option>
        </select>
      </div>

      <div>
        <label for="bucket-name" class="block text-sm font-semibold text-gray-700 mb-1.5"
          >Bucket Name</label
        >
        <input
          id="bucket-name"
          type="text"
          bind:value={bucket}
          class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
          placeholder="my-pulumi-state"
        />
      </div>

      {#if provider === 's3'}
        <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div class="col-span-2 sm:col-span-1">
            <label for="s3-region" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >Region</label
            >
            <input
              id="s3-region"
              type="text"
              bind:value={region}
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none"
              placeholder="us-east-1"
            />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label for="s3-endpoint" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >Custom Endpoint</label
            >
            <input
              id="s3-endpoint"
              type="text"
              bind:value={endpoint}
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none"
              placeholder="Optional"
            />
          </div>
          <div class="col-span-2">
            <label for="s3-key" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >Access Key ID</label
            >
            <input
              id="s3-key"
              type="text"
              bind:value={accessKeyId}
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none"
              placeholder="AKIA..."
            />
          </div>
          <div class="col-span-2">
            <label for="s3-secret" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >Secret Access Key</label
            >
            <input
              id="s3-secret"
              type="password"
              bind:value={secretAccessKey}
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none"
              placeholder="••••••••"
            />
          </div>
        </div>
      {:else}
        <div class="space-y-4 pt-2 border-t border-gray-100">
          <div>
            <label for="gcp-project" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >GCP Project ID (Optional)</label
            >
            <input
              id="gcp-project"
              type="text"
              bind:value={gcpProjectId}
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none"
              placeholder="Leave empty for default ADC"
            />
          </div>
          <div>
            <label for="gcp-creds" class="block text-sm font-semibold text-gray-700 mb-1.5"
              >Credentials JSON (Optional)</label
            >
            <textarea
              id="gcp-creds"
              bind:value={gcpCredentials}
              rows="4"
              class="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none font-mono text-xs"
              placeholder="Paste Service Account JSON"
            ></textarea>
            <p class="text-xs text-gray-500 mt-2">
              Leave blank to use GOOGLE_APPLICATION_CREDENTIALS or active gcloud session.
            </p>
          </div>
        </div>
      {/if}

      {#if configError}
        <div
          class="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium"
        >
          {configError}
        </div>
      {/if}

      {#if saveSuccess}
        <div
          class="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <CheckCircle class="w-4 h-4" /> Connection saved successfully.
        </div>
      {/if}

      <div class="pt-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={cancelEdit}
          class="btn-secondary font-semibold py-2.5 px-6 rounded-xl"
          >Cancel</button
        >
        <button
          on:click={saveSettings}
          disabled={isConnecting}
          class="btn-primary font-semibold py-2.5 px-6 rounded-xl shadow-md flex items-center justify-center gap-2"
        >
          {#if isConnecting}
            <RefreshCw class="w-5 h-5 animate-spin" /> Saving...
          {:else}
            Save Connection
          {/if}
        </button>
      </div>
    </div>
      </div>
    </div>
  {/if}

  {#if isDeleteModalOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-slate-900/50"
      on:click={closeDeleteModal}
      aria-label="Close delete confirmation modal"
    ></button>

    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Delete backend confirmation"
      >
        <div class="border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 class="text-lg font-bold text-gray-900">Delete Storage Backend</h3>
          <button
            type="button"
            on:click={closeDeleteModal}
            class="btn-ghost p-2 rounded-md text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Close modal"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="px-5 py-4">
          <p class="text-sm text-gray-600">
            This will remove
            <span class="font-semibold text-gray-900">{backendToDeleteName || 'this backend'}</span>
            from your configuration.
          </p>
          <p class="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              on:click={closeDeleteModal}
              disabled={isDeleting}
              class="btn-secondary font-semibold py-2 px-4 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              on:click={confirmDeleteBackend}
              disabled={isDeleting}
              class="btn-danger font-semibold py-2 px-4 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {#if isDeleting}
                <RefreshCw class="w-4 h-4 animate-spin" /> Deleting...
              {:else}
                Delete Backend
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
