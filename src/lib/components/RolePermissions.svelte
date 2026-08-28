<script lang="ts">
  import { Plus, Shield } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';

  export let initialRoles: RoleRow[] = [];
  export let title = '';
  export let description = '';
  export let baseHref = 'roles-permissions';

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
    permissions: string[];
    createdAt: string;
    updatedAt: string;
  };

  $: roles = initialRoles;
  $: resolvedTitle = title || $_('rolePermissions.defaultTitle');
  $: resolvedDescription = description || $_('rolePermissions.defaultDescription');

  function roleHref(role: RoleRow): string {
    return `${baseHref}/${role.id}`;
  }
</script>

<svelte:head>
  <title>{resolvedTitle}</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">{resolvedTitle}</h3>
      <p class="mt-2 text-sm text-slate-600">{resolvedDescription}</p>
    </div>
    <a
      href={`${baseHref}/new`}
      class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
    >
      <Plus class="h-4 w-4" />
      {$_('rolePermissions.addRole')}
    </a>
  </section>

  {#if roles.length === 0}
    <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
      {$_('rolePermissions.empty')}
    </div>
  {:else}
    <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th class="px-4 py-3">{$_('common.name')}</th>
            <th class="px-4 py-3">{$_('common.slug')}</th>
          </tr>
        </thead>
        <tbody>
          {#each roles as role (role.id)}
            <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td class="px-4 py-3">
                <a href={roleHref(role)} class="inline-flex items-center gap-2 font-medium text-slate-900">
                  <Shield class="h-4 w-4 text-slate-500" />
                  {role.name}
                </a>
              </td>
              <td class="px-4 py-3 text-slate-600">
                <a href={roleHref(role)}>{role.slug}</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
