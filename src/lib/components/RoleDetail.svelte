<script lang="ts">
  import { deserialize } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { CheckCircle, ChevronDown, ChevronRight, Pencil, Save, Trash2, X } from '@lucide/svelte';
  import permissionsCatalog, { defaultActions } from '$lib/config/permissions';
  import { toStoredPermissionGrant } from '$lib/permissions';
  import { _ } from 'svelte-i18n';

  export let scope: 'cluster' | 'organization' | 'project';
  export let role: RoleRow | null = null;
  export let cancelHref = './';
  export let title = '';

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
    permissions: string[];
    createdAt?: string;
    updatedAt?: string;
  };

  type PermissionScope = 'cluster' | 'organization' | 'project';

  type PermissionSection = {
    section?: string;
    resource: string;
    permissions?: string[];
    sections?: Record<string, PermissionSection> | PermissionSection[];
  };

  type PermissionRow = {
    key: string;
    resource: string;
    depth: number;
    permissions: string[];
    descendantPermissions: string[];
    actionPermissions: Record<string, string>;
    inheritedPrefixes: string[];
    hasChildren: boolean;
  };

  type AccessLevel = 'none' | 'read' | 'full' | 'custom';

  const visibleActions = defaultActions.filter((action) => action !== 'all');
  const isCreate = !role;
  let roleName = role?.name ?? '';
  let roleSlug = role?.slug ?? '';
  let selectedPermissions = toUiPermissions(role?.permissions ?? []);
  let saving = false;
  let deleting = false;
  let detailError = '';
  let detailSuccess = '';
  let expanded: Record<string, boolean> = {};
  let accessLevelOverrides: Record<string, AccessLevel> = {};

  $: permissionRows = getPermissionRows(scope);
  $: visiblePermissionRows = permissionRows.filter((row) => isRowVisible(row));
  $: selectedPermissionsKey = selectedPermissions.join('|');

  function sectionChildren(section: PermissionSection): PermissionSection[] {
    if (!section.sections) return [];
    return Array.isArray(section.sections) ? section.sections : Object.values(section.sections);
  }

  function actionFrom(permission: string): string {
    return permission.split(':').at(-1) ?? permission;
  }

  function prefixFrom(permission: string): string {
    const parts = permission.split(':');
    return parts.slice(0, -1).join(':');
  }

  function rowLabel(row: PermissionRow): string {
    return row.resource.replaceAll('-', ' ');
  }

  function flattenSection(
    sectionNode: PermissionSection,
    fallbackSection: string,
    depth = 0,
    inheritedPrefixes: string[] = [],
    path: string[] = [],
  ): PermissionRow[] {
    const sectionName = sectionNode.section ?? fallbackSection;
    const permissions = sectionNode.permissions ?? [];
    const children = sectionChildren(sectionNode);
    const actionPermissions = Object.fromEntries(
      permissions.map((permission) => [actionFrom(permission), permission]),
    );
    const ownPrefixes = [...new Set(permissions.map(prefixFrom).filter(Boolean))];
    const key = [...path, sectionNode.resource].join('/');
    const childRows = children.flatMap((child) =>
      flattenSection(
        child,
        sectionName,
        depth + 1,
        [...inheritedPrefixes, ...ownPrefixes],
        [...path, sectionNode.resource],
      ),
    );
    const row: PermissionRow = {
      key,
      resource: sectionNode.resource,
      depth,
      permissions,
      descendantPermissions: childRows.flatMap((childRow) => [
        ...childRow.permissions,
        ...childRow.descendantPermissions,
      ]),
      actionPermissions,
      inheritedPrefixes,
      hasChildren: children.length > 0,
    };

    return permissions.length > 0 || children.length > 0 ? [row, ...childRows] : childRows;
  }

  function getPermissionRows(currentScope: PermissionScope): PermissionRow[] {
    const root = permissionsCatalog.sections[currentScope] as PermissionSection;
    if (!root) return [];

    const rootPermissions = root.permissions ?? [];
    const rootRows = rootPermissions.length
      ? flattenSection({ ...root, sections: [] }, currentScope, 0, [], [])
      : [];
    const rootPrefixes = [...new Set(rootPermissions.map(prefixFrom).filter(Boolean))];
    const childRows = sectionChildren(root).flatMap((child) =>
      flattenSection(child, root.section ?? currentScope, 0, rootPrefixes, []),
    );

    return [...rootRows, ...childRows];
  }

  function toStoredPermissions(uiPermissions: readonly string[]): string[] {
    return [
      ...new Set(uiPermissions.map((permission) => toStoredPermissionGrant(permission, scope))),
    ];
  }

  function toUiPermissions(storedPermissions: readonly string[]): string[] {
    const storedSet = new Set(storedPermissions);
    const rows = getPermissionRows(scope);
    const mappedPermissions = rows.flatMap((row) =>
      row.permissions.filter((permission) => storedSet.has(permission)),
    );

    return [...new Set(mappedPermissions)];
  }

  function inheritedPermission(row: PermissionRow, action: string): string | null {
    return (
      row.inheritedPrefixes
        .flatMap((prefix) => [`${prefix}:all`, `${prefix}:${action}`])
        .find((permission) => selectedPermissions.includes(permission)) ?? null
    );
  }

  function isPermissionSelected(row: PermissionRow, permission: string): boolean {
    const action = actionFrom(permission);
    const prefix = prefixFrom(permission);
    return (
      selectedPermissions.includes(permission) ||
      selectedPermissions.includes(`${prefix}:all`) ||
      Boolean(inheritedPermission(row, action))
    );
  }

  function isVisiblePermissionSelected(row: PermissionRow, permission: string): boolean {
    const level = accessLevel(row);
    const action = actionFrom(permission);

    if (level === 'full') return true;
    if (level === 'read') return action === 'read';

    return isPermissionSelected(row, permission);
  }

  function isPermissionDisabled(row: PermissionRow, permission: string): boolean {
    const action = actionFrom(permission);
    const prefix = prefixFrom(permission);
    return (
      Boolean(inheritedPermission(row, action)) || selectedPermissions.includes(`${prefix}:all`)
    );
  }

  function hasInheritedAccess(row: PermissionRow): boolean {
    return ['all', ...visibleActions].some((action) => Boolean(inheritedPermission(row, action)));
  }

  function togglePermission(row: PermissionRow, permission: string) {
    if (isPermissionDisabled(row, permission)) return;

    accessLevelOverrides = { ...accessLevelOverrides, [row.key]: 'custom' };

    const action = actionFrom(permission);
    const prefix = prefixFrom(permission);

    if (action === 'all') {
      selectedPermissions = selectedPermissions.includes(permission)
        ? selectedPermissions.filter((currentPermission) => currentPermission !== permission)
        : [
            ...selectedPermissions.filter(
              (currentPermission) => !currentPermission.startsWith(`${prefix}:`),
            ),
            permission,
          ];
      return;
    }

    selectedPermissions = selectedPermissions.includes(permission)
      ? selectedPermissions.filter((currentPermission) => currentPermission !== permission)
      : [...selectedPermissions, permission];
  }

  function rowPermissionsForDefaultActions(row: PermissionRow): string[] {
    return visibleActions
      .map((action) => row.actionPermissions[action])
      .filter((permission): permission is string => Boolean(permission));
  }

  function visibleRowPermissions(row: PermissionRow): string[] {
    return row.permissions.filter((permission) => actionFrom(permission) !== 'all');
  }

  function selectedDirectPermissions(row: PermissionRow): string[] {
    return row.permissions.filter((permission) => selectedPermissions.includes(permission));
  }

  function accessLevel(row: PermissionRow): AccessLevel {
    if (accessLevelOverrides[row.key] === 'custom') return 'custom';

    const directPermissions = selectedDirectPermissions(row);
    const inheritedAll = inheritedPermission(row, 'all');
    const allPermission = row.actionPermissions.all;
    const readPermission = row.actionPermissions.read;

    if (inheritedAll || (allPermission && selectedPermissions.includes(allPermission))) {
      return 'full';
    }

    const actionPermissions = rowPermissionsForDefaultActions(row);
    const selectedActions = actionPermissions.filter((permission) =>
      isPermissionSelected(row, permission),
    );

    if (!directPermissions.length && selectedActions.length === 0) return 'none';

    if (
      readPermission &&
      selectedActions.length === 1 &&
      selectedActions[0] === readPermission &&
      directPermissions.every((permission) => permission === readPermission)
    ) {
      return 'read';
    }

    if (
      actionPermissions.length > 0 &&
      selectedActions.length === actionPermissions.length &&
      directPermissions.every((permission) => permission !== allPermission)
    ) {
      return 'full';
    }

    return 'custom';
  }

  function selectableAccessLevels(row: PermissionRow): AccessLevel[] {
    return row.actionPermissions.read && row.actionPermissions.all
      ? ['none', 'read', 'full', 'custom']
      : ['none', 'custom'];
  }

  function clearSubtreePermissions(row: PermissionRow): string[] {
    const subtreePermissions = new Set([...row.permissions, ...row.descendantPermissions]);
    return selectedPermissions.filter((permission) => !subtreePermissions.has(permission));
  }

  function setAccessLevel(row: PermissionRow, level: AccessLevel) {
    const clearedPermissions = clearSubtreePermissions(row);
    const descendantKeys = new Set(
      permissionRows
        .filter((permissionRow) => permissionRow.key.startsWith(`${row.key}/`))
        .map((permissionRow) => permissionRow.key),
    );
    accessLevelOverrides = Object.fromEntries(
      Object.entries(accessLevelOverrides).filter(
        ([key]) => key !== row.key && !descendantKeys.has(key),
      ),
    );

    if (level === 'none' || level === 'custom') {
      selectedPermissions = clearedPermissions;
      if (level === 'custom') {
        accessLevelOverrides = { ...accessLevelOverrides, [row.key]: 'custom' };
        expanded = { ...expanded, [row.key]: true };
      }
      return;
    }

    const permission = level === 'read' ? row.actionPermissions.read : row.actionPermissions.all;
    selectedPermissions = permission ? [...clearedPermissions, permission] : clearedPermissions;
    expanded = { ...expanded, [row.key]: true };
  }

  function onAccessLevelChange(row: PermissionRow, event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    setAccessLevel(row, target.value as AccessLevel);
  }

  function toggleExpanded(row: PermissionRow) {
    expanded = { ...expanded, [row.key]: !expanded[row.key] };
  }

  function isRowVisible(row: PermissionRow): boolean {
    const ancestors = row.key.split('/').slice(0, -1);
    return ancestors.every((_, index) => expanded[ancestors.slice(0, index + 1).join('/')]);
  }

  function hasExpandableContent(row: PermissionRow): boolean {
    return row.hasChildren || row.permissions.length > 0;
  }

  function flashSuccess(message: string) {
    detailSuccess = message;
    setTimeout(() => {
      detailSuccess = '';
    }, 2500);
  }

  async function submitAction(action: string, values: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);

    const response = await fetch(`?/${action}`, { method: 'POST', body: formData });
    const result = deserialize(await response.text());
    if (result.type === 'failure' || result.type === 'error') {
      const data = result.type === 'failure' ? result.data : null;
      throw new Error(typeof data?.error === 'string' ? data.error : $_('roleDetail.actionFailed'));
    }

    return result.data as { role?: RoleRow } | null;
  }

  async function saveRole() {
    detailError = '';
    saving = true;

    try {
      const result = await submitAction(isCreate ? 'createRole' : 'updateRole', {
        id: role?.id ?? '',
        name: roleName.trim(),
        slug: roleSlug.trim(),
        permissions: JSON.stringify(toStoredPermissions(selectedPermissions)),
      });

      if (isCreate && result?.role?.id) {
        await goto(`${cancelHref}/${result.role.id}`);
        return;
      }

      await invalidateAll();
      flashSuccess($_('roleDetail.saved'));
    } catch (error: unknown) {
      detailError = error instanceof Error ? error.message : $_('roleDetail.saveFailed');
    } finally {
      saving = false;
    }
  }

  async function deleteRole() {
    if (!role) return;

    detailError = '';
    deleting = true;
    try {
      await submitAction('deleteRole', { id: role.id });
      await goto(cancelHref);
    } catch (error: unknown) {
      detailError = error instanceof Error ? error.message : $_('roleDetail.deleteFailed');
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>{title || $_('roleDetail.defaultTitle')}</title>
</svelte:head>

<div class="">
  {#if detailError}
    <div
      class="w-full rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
    >
      {detailError}
    </div>
  {/if}
  {#if detailSuccess}
    <div
      class="w-full rounded-md border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100"
    >
      <span class="inline-flex items-center gap-2"
        ><CheckCircle class="h-4 w-4" /> {detailSuccess}</span
      >
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(0,4fr)]">
    <aside class="self-start rounded-md border border-[#34363d] bg-[#1a1b1f] p-4 shadow-sm">
      <div class="flex items-center justify-between gap-3 border-b border-[#5c5f66] pb-4">
        <h3 class="text-base font-semibold text-white">
          {scope === 'organization'
            ? $_('roleDetail.orgRoleDetails')
            : scope === 'project'
              ? $_('roleDetail.projectRoleDetails')
              : $_('roleDetail.clusterRoleDetails')}
        </h3>
        <Pencil class="h-4 w-4 text-slate-400" />
      </div>

      <div class="mt-5 space-y-5 text-sm">
        {#if !isCreate && role?.id}
          <div>
            <div class="font-semibold text-slate-400">{$_('roleDetail.roleId')}</div>
            <div class="mt-1 break-all text-slate-300">{role.id}</div>
          </div>
        {/if}

        <div>
          <label class="block font-semibold text-slate-400" for="role-name"
            >{$_('common.name')}</label
          >
          <input
            id="role-name"
            type="text"
            bind:value={roleName}
            class="mt-1 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-[#dfff22] focus:bg-[#24262b] focus:px-2"
            placeholder={$_('roleDetail.developerPlaceholder')}
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-400" for="role-slug"
            >{$_('common.slug')}</label
          >
          <input
            id="role-slug"
            type="text"
            bind:value={roleSlug}
            readonly={!isCreate}
            class="mt-1 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-slate-200 outline-none transition placeholder:text-slate-600 read-only:text-slate-300 focus:border-[#dfff22] focus:bg-[#24262b] focus:px-2"
            placeholder="developer"
          />
        </div>

        <div>
          <div class="font-semibold text-slate-400">{$_('common.description')}</div>
          <div class="mt-1 text-slate-300">
            {isCreate
              ? $_('roleDetail.newRole')
              : `${roleName || $_('common.role')} ${$_('roleDetail.roleSuffix')}`}
          </div>
        </div>
      </div>
    </aside>

    <section class="min-w-0 rounded-md border border-[#34363d] bg-[#1a1b1f] shadow-sm">
      <div class="flex items-center justify-between gap-4 border-b border-[#5c5f66] px-4 py-4">
        <h4 class="text-lg font-semibold text-white">{$_('roleDetail.permissions')}</h4>
        <div class="flex items-center gap-3">
          {#if !isCreate}
            <button
              type="button"
              on:click={deleteRole}
              disabled={deleting}
              class="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-60"
            >
              <Trash2 class="h-4 w-4" />
              {deleting ? $_('roleDetail.deleting') : $_('common.delete')}
            </button>
          {/if}
          <button
            type="button"
            on:click={saveRole}
            disabled={saving}
            class="inline-flex h-10 items-center gap-2 rounded-md bg-[#dfff22] px-4 text-sm font-semibold text-[#141510] transition hover:bg-[#e8ff4d] disabled:opacity-60"
          >
            <Save class="h-4 w-4" />
            {saving ? $_('roleDetail.saving') : $_('common.save')}
          </button>
          <a
            href={cancelHref}
            class="inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-400 transition hover:text-white"
          >
            <X class="h-4 w-4" />
            {$_('common.cancel')}
          </a>
        </div>
      </div>
      <div class="overflow-hidden p-4">
        <table class="w-full overflow-hidden rounded-md border border-[#282a30] text-sm">
          <thead>
            <tr class="bg-[#202126] text-left text-xs font-semibold uppercase text-slate-400">
              <th class="w-[58%] px-18 py-4">{$_('roleDetail.resource')}</th>
              <th class="px-4 py-4">{$_('roleDetail.permission')}</th>
            </tr>
          </thead>
          <tbody>
            {#each visiblePermissionRows as permissionRow (permissionRow.key)}
              <tr class="border-t border-[#2d3036] bg-[#202126] first:border-t-0">
                <td class="px-4 py-3 font-semibold text-slate-200">
                  <div
                    class="flex items-center"
                    style={`padding-left: ${permissionRow.depth * 1.4}rem;`}
                  >
                    {#if hasExpandableContent(permissionRow)}
                      <button
                        type="button"
                        on:click={() => toggleExpanded(permissionRow)}
                        class="mr-6 inline-flex h-6 w-6 items-center justify-center rounded text-slate-300 transition hover:bg-[#30323a] hover:text-white"
                        aria-label={expanded[permissionRow.key]
                          ? $_('roleDetail.collapseSection')
                          : $_('roleDetail.expandSection')}
                      >
                        {#if expanded[permissionRow.key]}
                          <ChevronDown class="h-4 w-4" />
                        {:else}
                          <ChevronRight class="h-4 w-4" />
                        {/if}
                      </button>
                    {:else}
                      <span class="mr-6 h-6 w-6"></span>
                    {/if}
                    <span class:text-slate-500={!permissionRow.permissions.length}>
                      {rowLabel(permissionRow)}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  {#if permissionRow.permissions.length}
                    {#key `${permissionRow.key}:${accessLevel(permissionRow)}`}
                      <select
                        class="w-full max-w-40 rounded-md border border-[#30323a] bg-[#2b2c33] px-3 py-2 text-sm font-medium text-slate-200 outline-none transition focus:border-[#dfff22] disabled:opacity-60"
                        value={accessLevel(permissionRow)}
                        disabled={hasInheritedAccess(permissionRow)}
                        on:change={(event) => onAccessLevelChange(permissionRow, event)}
                      >
                        {#each selectableAccessLevels(permissionRow) as level}
                          <option value={level}>
                            {level === 'none'
                              ? $_('roleDetail.noAccess')
                              : level === 'read'
                                ? $_('roleDetail.readOnly')
                                : level === 'full'
                                  ? $_('roleDetail.fullAccess')
                                  : $_('roleDetail.custom')}
                          </option>
                        {/each}
                      </select>
                    {/key}
                  {:else}
                    <span class="text-sm font-medium text-slate-500"
                      >{$_('roleDetail.sectionGroup')}</span
                    >
                  {/if}
                </td>
              </tr>

              {#if expanded[permissionRow.key] && permissionRow.permissions.length}
                <tr class="border-t border-[#2d3036] bg-[#171a20]">
                  <td colspan="2" class="px-8 py-5">
                    <div
                      class="grid gap-x-16 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
                      style={`padding-left: ${permissionRow.depth * 1.4 + 1.5}rem;`}
                    >
                      {#each visibleRowPermissions(permissionRow) as permission}
                        {@const action = actionFrom(permission)}
                        {#key `${permission}:${selectedPermissionsKey}`}
                          <label
                            class="inline-flex items-center gap-3 text-sm font-medium text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={isVisiblePermissionSelected(permissionRow, permission)}
                              disabled={isPermissionDisabled(permissionRow, permission)}
                              on:change={() => togglePermission(permissionRow, permission)}
                              class="h-4 w-4 rounded border-[#636772] bg-[#15171c] text-[#dfff22] focus:ring-[#dfff22] disabled:opacity-50"
                              title={inheritedPermission(permissionRow, action) ?? permission}
                            />
                            <span class="capitalize">{action}</span>
                          </label>
                        {/key}
                      {/each}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>
