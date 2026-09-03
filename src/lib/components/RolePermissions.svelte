<script lang="ts">
  import { Pencil, Plus, Shield, Users } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let initialRoles: RoleRow[] = [];
  export let title = '';
  export let description = '';
  export let baseHref = 'roles-permissions';
  export let canCreate = true;

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
    permissions: string[];
    description?: string;
    userCount?: number;
    createdAt: string;
    updatedAt: string;
  };

  $: roles = initialRoles;
  $: resolvedTitle = title || $_('rolePermissions.defaultTitle');
  $: resolvedDescription = description || $_('rolePermissions.defaultDescription');

  const systemRoleSlugs = new Set([
    'admin',
    'cluster-admin',
    'cluster-user',
    'org-admin',
    'org-developer',
    'project-admin',
    'project-developer',
    'project-viewer',
  ]);

  function roleHref(role: RoleRow): string {
    return `${baseHref}/${role.id}`;
  }

  function roleDescription(role: RoleRow): string {
    if (role.description) return role.description;
    if (role.slug === 'cluster-admin') return 'Acceso completo al clúster y todas las organizaciones.';
    if (role.slug === 'cluster-user') return 'Acceso de lectura y gestión de recursos limitados.';
    return `${role.permissions.length} permisos configurados.`;
  }

  function roleAccent(index: number) {
    return index % 2 === 0
      ? 'border-violet-500/25 bg-violet-500/10 text-violet-300 shadow-[0_0_22px_rgba(124,58,237,0.16)]'
      : 'border-teal-500/25 bg-teal-500/10 text-teal-300 shadow-[0_0_22px_rgba(20,184,166,0.16)]';
  }

  function isSystemRole(role: RoleRow): boolean {
    return systemRoleSlugs.has(role.slug);
  }
</script>

<svelte:head>
  <title>{resolvedTitle}</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-[26px] font-bold tracking-tight text-white">{resolvedTitle}</h3>
      <p class="mt-2 text-sm text-slate-400">{resolvedDescription}</p>
    </div>
    {#if canCreate}
      <a
        href={`${baseHref}/new`}
        class="btn-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-[0_12px_30px_rgba(36,87,255,0.26)]"
      >
        <Plus class="h-5 w-5" />
        {$_('rolePermissions.addRole')}
      </a>
    {/if}
  </section>

  {#if roles.length === 0}
    <div
      class="rounded-lg border border-dashed border-[#243651] bg-[#071323]/70 px-4 py-5 text-sm text-slate-400"
    >
      {$_('rolePermissions.empty')}
    </div>
  {:else}
    <section class="overflow-x-auto rounded-lg border border-[#142236] bg-[#06111f]/72">
      <table class="w-full min-w-[760px] text-sm">
        <thead>
          <tr
            class="border-b border-[#101e31] text-left text-xs font-semibold uppercase tracking-[0.06em] text-[#8a96aa]"
          >
            <th class="px-6 py-4">{$_('common.name')}</th>
            <th class="px-6 py-4">{$_('common.slug')}</th>
            <th class="px-6 py-4">Descripción</th>
            <th class="px-6 py-4">Usuarios</th>
            <th class="px-6 py-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each roles as role, index (role.id)}
            <tr class="border-b border-[#101e31] transition-colors last:border-0 hover:bg-[#0a1829]">
              <td class="px-6 py-5">
                <a
                  href={roleHref(role)}
                  class="inline-flex items-center gap-4 font-semibold text-white"
                >
                  <span class={`flex h-12 w-12 items-center justify-center rounded-lg border ${roleAccent(index)}`}>
                    <Shield class="h-6 w-6" />
                  </span>
                  <span class="inline-flex items-center gap-3">
                    {role.name}
                    {#if isSystemRole(role)}
                      <span class="rounded-md bg-[#082057] px-2 py-1 text-xs font-medium text-[#8ea8ff]">Sistema</span>
                    {/if}
                  </span>
                </a>
              </td>
              <td class="px-6 py-5 text-slate-300">
                <a href={roleHref(role)}>{role.slug}</a>
              </td>
              <td class="max-w-[300px] px-6 py-5 leading-6 text-slate-300">{roleDescription(role)}</td>
              <td class="px-6 py-5 text-white">
                <span class="inline-flex items-center gap-2">
                  <Users class="h-4 w-4 text-slate-400" />
                  {role.userCount ?? 0}
                </span>
              </td>
              <td class="px-6 py-5">
                <div class="flex justify-end gap-3">
                  <a
                    href={roleHref(role)}
                    class="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-200"
                    aria-label={`Editar ${role.name}`}
                  >
                    <Pencil class="h-5 w-5" />
                  </a>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
