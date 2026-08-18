<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  type ProviderType = 'github' | 'bitbucket' | 'custom';

  let selectedType: ProviderType = 'github';
  let customClaims: { key: string; value: string }[] = [{ key: '', value: '' }];
  let editingId: string | null = null;

  function startNew() {
    editingId = null;
    selectedType = 'github';
    customClaims = [{ key: '', value: '' }];
  }

  function addClaim() {
    customClaims = [...customClaims, { key: '', value: '' }];
  }

  function removeClaim(index: number) {
    customClaims = customClaims.filter((_, i) => i !== index);
  }

  function typeLabel(type: string) {
    if (type === 'github') return 'GitHub Actions';
    if (type === 'bitbucket') return 'Bitbucket Pipelines';
    return 'Custom';
  }
</script>

<svelte:head>
  <title>OIDC Providers - Server Access Keys - Settings</title>
</svelte:head>

<div class="space-y-8">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">OIDC JWT Validation</h3>
    <p class="mt-2 text-sm text-slate-600">
      Configure OpenID Connect providers to allow secretless authentication for CI/CD runners.
    </p>
  </section>

  {#if form?.message}
    <div class="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
      {form.message}
    </div>
  {/if}

  <!-- Existing Providers -->
  {#if data.providers.length > 0}
    <section class="space-y-3">
      <h4 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Configured Providers</h4>
      {#each data.providers as provider}
        <div class="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3">
          <div>
            <span class="font-medium text-slate-800">{typeLabel(provider.type)}</span>
            <span class="ml-2 text-xs text-slate-500">{provider.audience}</span>
            {#if !provider.enabled}
              <span class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Disabled</span>
            {/if}
          </div>
          <form
            method="POST"
            action="?/delete"
            use:enhance
            on:submit={(e) => { if (!confirm('Delete this provider?')) e.preventDefault(); }}
          >
            <input type="hidden" name="id" value={provider.id} />
            <button
              type="submit"
              class="text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          </form>
        </div>
      {/each}
    </section>
  {/if}

  <!-- Add / Edit Form -->
  <section class="rounded-md border border-slate-200 bg-slate-50 p-6">
    <h4 class="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
      Add OIDC Provider
    </h4>

    <form method="POST" action="?/save" use:enhance class="space-y-5">
      {#if editingId}
        <input type="hidden" name="id" value={editingId} />
      {/if}

      <!-- Provider Type -->
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Provider Type</label>
        <div class="flex gap-4">
          {#each [['github', 'GitHub Actions'], ['bitbucket', 'Bitbucket Pipelines'], ['custom', 'Custom']] as [val, label]}
            <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="type"
                value={val}
                bind:group={selectedType}
                class="accent-slate-700"
              />
              {label}
            </label>
          {/each}
        </div>
      </div>

      <!-- Enabled toggle -->
      <div class="flex items-center gap-2">
        <input type="checkbox" id="enabled" name="enabled" value="on" checked class="accent-slate-700" />
        <label for="enabled" class="text-sm text-slate-700">Enabled</label>
      </div>

      <!-- Audience (shared) -->
      <div>
        <label for="audience" class="mb-1 block text-sm font-medium text-slate-700">Expected Audience</label>
        <input
          type="text"
          id="audience"
          name="audience"
          required
          placeholder="https://api.mycompany.com"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <!-- GitHub-specific -->
      {#if selectedType === 'github'}
        <div>
          <label for="allowed_repos" class="mb-1 block text-sm font-medium text-slate-700">
            Allowed Repositories <span class="font-normal text-slate-400">(one per line, e.g. org/repo)</span>
          </label>
          <textarea
            id="allowed_repos"
            name="allowed_repos"
            rows="4"
            placeholder="my-org/my-repo"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          ></textarea>
        </div>
      {/if}

      <!-- Bitbucket-specific -->
      {#if selectedType === 'bitbucket'}
        <div>
          <label for="allowed_workspace_uuids" class="mb-1 block text-sm font-medium text-slate-700">
            Allowed Workspace UUIDs <span class="font-normal text-slate-400">(one per line)</span>
          </label>
          <textarea
            id="allowed_workspace_uuids"
            name="allowed_workspace_uuids"
            rows="3"
            placeholder="{'{'}workspace-uuid{'}'}"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          ></textarea>
        </div>
        <div>
          <label for="allowed_repository_uuids" class="mb-1 block text-sm font-medium text-slate-700">
            Allowed Repository UUIDs <span class="font-normal text-slate-400">(one per line)</span>
          </label>
          <textarea
            id="allowed_repository_uuids"
            name="allowed_repository_uuids"
            rows="3"
            placeholder="{'{'}repository-uuid{'}'}"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          ></textarea>
        </div>
      {/if}

      <!-- Custom-specific -->
      {#if selectedType === 'custom'}
        <div>
          <label for="issuer" class="mb-1 block text-sm font-medium text-slate-700">Issuer URL (iss)</label>
          <input
            type="url"
            id="issuer"
            name="issuer"
            placeholder="https://custom-auth.example.com"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label for="jwks_uri" class="mb-1 block text-sm font-medium text-slate-700">JWKS Endpoint URL</label>
          <input
            type="url"
            id="jwks_uri"
            name="jwks_uri"
            placeholder="https://custom-auth.example.com/.well-known/jwks.json"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <div class="mb-2 flex items-center justify-between">
            <label class="text-sm font-medium text-slate-700">Required Claims</label>
            <button type="button" on:click={addClaim} class="text-xs text-slate-500 hover:text-slate-700 hover:underline">
              + Add claim
            </button>
          </div>
          <div class="space-y-2">
            {#each customClaims as claim, i}
              <div class="flex gap-2">
                <input
                  type="text"
                  name="claim_key"
                  bind:value={claim.key}
                  placeholder="claim name"
                  class="w-1/2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <input
                  type="text"
                  name="claim_value"
                  bind:value={claim.value}
                  placeholder="expected value"
                  class="w-1/2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                {#if customClaims.length > 1}
                  <button
                    type="button"
                    on:click={() => removeClaim(i)}
                    class="text-slate-400 hover:text-red-500"
                    aria-label="Remove claim"
                  >✕</button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="flex justify-end">
        <button
          type="submit"
          class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          Save Provider
        </button>
      </div>
    </form>
  </section>
</div>
