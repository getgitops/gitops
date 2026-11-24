<!-- Lista de roles (GitOps, organización o proyecto). Cada fila abre el editor del rol. -->
<script lang="ts">
  import { ChevronRight, Lock, Plus, Search, Shield, Users } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

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

  type Props = {
    initialRoles?: RoleRow[];
    title?: string;
    description?: string;
    baseHref?: string;
    canCreate?: boolean;
  };

  let {
    initialRoles = [],
    title = '',
    description = '',
    baseHref = 'roles-permissions',
    canCreate = true,
  }: Props = $props();

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

  let query = $state('');
  const resolvedTitle = $derived(title || $_('rolePermissions.defaultTitle'));
  const isSystem = (role: RoleRow) => systemRoleSlugs.has(role.slug);

  // primero los de sistema, después los personalizados; cada grupo por nombre
  const roles = $derived(
    [...initialRoles]
      .filter((role) => {
        const q = query.trim().toLowerCase();
        return !q || role.name.toLowerCase().includes(q) || role.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(isSystem(b)) - Number(isSystem(a)) || a.name.localeCompare(b.name)),
  );

  function roleDescription(role: RoleRow): string {
    if (role.description) return role.description;
    if (role.slug === 'cluster-admin') return $_('rolePermissions.clusterAdminDescription');
    if (role.slug === 'cluster-user') return $_('rolePermissions.clusterUserDescription');
    return $_('rolePermissions.permissionCount', { values: { count: role.permissions.length } });
  }
</script>

<svelte:head>
  <title>{resolvedTitle}</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{resolvedTitle}</h1>
      <p class="mt-1 text-sm text-fg-muted">
        {description || $_('rolePermissions.defaultDescription')}
      </p>
    </div>
    {#if canCreate}
      <a href={`${baseHref}/new`} class="k-btn k-btn-primary">
        <Plus class="h-4 w-4" />{$_('rolePermissions.addRole')}
      </a>
    {/if}
  </header>

  <div class="k-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <label class="relative w-full sm:w-72">
        <span class="sr-only">{$_('rolePermissions.search')}</span>
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          class="k-input h-9 pl-9"
          placeholder={$_('rolePermissions.search')}
          bind:value={query}
        />
      </label>
      <span class="ml-auto text-xs text-fg-subtle">
        {$_('rolePermissions.count', { values: { count: initialRoles.length } })}
      </span>
    </div>

    {#if roles.length === 0}
      <p class="px-5 py-12 text-center text-sm text-fg-subtle">
        {initialRoles.length === 0 ? $_('rolePermissions.empty') : $_('rolePermissions.noMatches')}
      </p>
    {:else}
      <ul class="divide-y divide-white/5">
        {#each roles as role (role.id)}
          <li>
            <a
              href={`${baseHref}/${role.id}`}
              class="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/2.5"
            >
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-lg {isSystem(role)
                  ? 'bg-white/5 text-fg-muted'
                  : 'bg-brand-500/12 text-brand-400'}"
              >
                <Shield class="h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-white">{role.name}</span>
                  <span class="font-mono text-xs text-fg-subtle">{role.slug}</span>
                  {#if isSystem(role)}
                    <span class="k-badge h-5 gap-1 px-2 text-[11px]"
                      ><Lock class="h-3 w-3" />{$_('rolePermissions.system')}</span
                    >
                  {/if}
                </span>
                <span class="mt-0.5 block truncate text-xs text-fg-subtle"
                  >{roleDescription(role)}</span
                >
              </span>
              <span
                class="hidden items-center gap-1.5 text-xs text-fg-muted sm:inline-flex"
                title={$_('rolePermissions.users')}
              >
                <Users class="h-3.5 w-3.5" />{role.userCount ?? 0}
              </span>
              <ChevronRight
                class="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-white"
              />
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
