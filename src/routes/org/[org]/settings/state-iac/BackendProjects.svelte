<!--
  Proyectos de Pulumi encontrados en el bucket de un backend y a qué proyecto de GitOps está
  asignado cada uno. Se descubren bajo demanda (lee el bucket) y cada cambio de asignación se
  guarda al momento contra la API.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle, LoaderCircle, RefreshCw, Trash2 } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { BackendProjectsResponse, ProjectOption } from './types';

  type Props = { backendId: string; projects: ProjectOption[]; canUpdate: boolean };
  let { backendId, projects, canUpdate }: Props = $props();

  let loading = $state(false);
  let saving = $state<string | null>(null);
  let result = $state<BackendProjectsResponse | null>(null);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const endpoint = (pulumiProject: string) =>
    `/api/state-iac/backends/${backendId}/projects/${encodeURIComponent(pulumiProject)}`;

  async function load() {
    loading = true;
    try {
      const response = await fetch(`/api/state-iac/backends/${backendId}/projects`);
      if (!response.ok) throw new Error(String(response.status));
      result = (await response.json()) as BackendProjectsResponse;
    } catch {
      toast.error($_('stateIac.projects.loadFailed'));
    } finally {
      loading = false;
    }
  }

  // discovery reads the bucket: only once the backend's section is shown
  onMount(() => {
    void load();
  });

  async function assign(pulumiProject: string, projectId: string) {
    saving = pulumiProject;
    try {
      const response = projectId
        ? await fetch(endpoint(pulumiProject), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectId }),
          })
        : await fetch(endpoint(pulumiProject), { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          errors?: Record<string, string>;
        };
        const code = Object.values(body.errors ?? {})[0];
        throw new Error(code ?? 'failed');
      }
      toast.success(
        projectId
          ? $_('stateIac.projects.assigned', {
              values: { pulumiProject, project: projectName(projectId) },
            })
          : $_('stateIac.projects.unassigned', { values: { pulumiProject } }),
      );
      await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : 'failed';
      const key = `stateIac.errors.${code}`;
      const text = $_(key);
      toast.error(text === key ? $_('stateIac.projects.assignFailed') : text);
      await load();
    } finally {
      saving = null;
    }
  }
</script>

<div class="space-y-3" data-testid="backend-projects">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-sm font-semibold text-fg">{$_('stateIac.projects.title')}</h3>
    <button
      type="button"
      class="k-btn k-btn-ghost k-btn-sm"
      onclick={() => load()}
      disabled={loading}
      aria-label={$_('stateIac.projects.refresh')}
    >
      {#if loading}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<RefreshCw
          class="h-4 w-4"
        />{/if}
      {$_('stateIac.projects.refresh')}
    </button>
  </div>

  {#if !result && loading}
    <p class="text-xs text-fg-subtle">{$_('stateIac.projects.loading')}</p>
  {:else if result}
    {#if !result.ok}
      <p
        class="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-red-200"
        role="alert"
      >
        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        {$_(`stateIac.errors.${result.error}`)}
      </p>
    {:else if result.projects.length === 0}
      <p
        class="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-xs text-fg-muted"
      >
        {$_('stateIac.projects.empty')}
      </p>
    {:else}
      {#if result.layout === 'legacy'}
        <p class="k-help">{$_('stateIac.projects.legacyNotice')}</p>
      {/if}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-fg-subtle">
            <tr>
              <th class="py-2 pr-3 font-medium">{$_('stateIac.projects.pulumiProject')}</th>
              <th class="py-2 pr-3 font-medium">{$_('stateIac.projects.stacks')}</th>
              <th class="py-2 font-medium">{$_('stateIac.projects.gitopsProject')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each result.projects as project (project.name ?? '__unknown__')}
              <tr data-pulumi-project={project.name ?? ''}>
                <td class="py-2 pr-3 font-mono text-xs text-fg">
                  {project.name ?? $_('stateIac.projects.unknownProject')}
                </td>
                <td class="py-2 pr-3">
                  <span class="flex flex-wrap gap-1">
                    {#each project.stacks as stack (stack)}
                      <span class="k-badge h-5 px-2 font-mono text-[10px]">{stack}</span>
                    {/each}
                  </span>
                </td>
                <td class="py-2">
                  {#if project.name === null}
                    <span class="text-xs text-fg-subtle">{$_('stateIac.projects.unknownHelp')}</span
                    >
                  {:else if canUpdate}
                    {@const pulumiProject = project.name}
                    <select
                      class="k-input h-8 min-w-48 text-xs"
                      aria-label="{$_('stateIac.projects.gitopsProject')}: {pulumiProject}"
                      value={project.binding?.projectId ?? ''}
                      disabled={saving !== null}
                      onchange={(event) => assign(pulumiProject, event.currentTarget.value)}
                    >
                      <option value="">{$_('stateIac.projects.unassignedOption')}</option>
                      {#each projects as option (option.id)}
                        <option value={option.id}>{option.name}</option>
                      {/each}
                    </select>
                    {#if saving === pulumiProject}<LoaderCircle
                        class="ml-2 inline h-4 w-4 animate-spin"
                      />{/if}
                  {:else}
                    <span class="text-xs text-fg-muted">
                      {project.binding
                        ? projectName(project.binding.projectId)
                        : $_('stateIac.projects.unassignedOption')}
                    </span>
                  {/if}
                  {#if project.binding && project.binding.stacks.length > 0}
                    <span class="mt-1 block text-[11px] text-fg-subtle">
                      {$_('stateIac.projects.onlyStacks', {
                        values: { stacks: project.binding.stacks.join(', ') },
                      })}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if result.truncated}
        <p class="k-help">{$_('stateIac.projects.truncated')}</p>
      {/if}
    {/if}

    {#if result.missing.length > 0}
      <div class="space-y-2">
        <p class="text-xs font-semibold text-fg-muted">{$_('stateIac.projects.missingTitle')}</p>
        <ul class="space-y-1">
          {#each result.missing as binding (binding.pulumiProject)}
            <li class="flex items-center gap-2 text-xs text-fg-subtle">
              <span class="font-mono">{binding.pulumiProject}</span>
              → {projectName(binding.projectId)}
              {#if canUpdate}
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                  aria-label="{$_('stateIac.projects.removeBinding')}: {binding.pulumiProject}"
                  disabled={saving !== null}
                  onclick={() => assign(binding.pulumiProject, '')}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>
