<script lang="ts">
  import { deserialize } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    KeyRound,
    LoaderCircle,
    Lock,
    Save,
    Trash2,
    Users,
  } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import permissionsCatalog, { defaultActions } from '#lib/config/permissions';
  import { normalizePermissionGrant, toStoredPermissionGrant } from '#lib/permissions';
  import { _ } from '#lib/i18n';

  export let scope: 'cluster' | 'organization' | 'project';
  export let role: RoleRow | null = null;
  export let cancelHref = './';
  export let title = '';
  export let canCreate = true;
  export let canUpdate = true;
  export let canDelete = true;

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
    permissions: string[];
    userCount?: number;
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
  const isCreate = !role;
  $: canSave = isCreate ? canCreate : canUpdate;
  $: roleIsSystem = Boolean(role?.slug && systemRoleSlugs.has(role.slug));
  let roleName = role?.name ?? '';
  let roleSlug = role?.slug ?? '';
  let selectedPermissions = toUiPermissions(role?.permissions ?? []);
  let saving = false;
  let deleting = false;
  let deleteOpen = false;
  // en un rol nuevo el slug se genera a partir del nombre hasta que se edita a mano
  let slugTouched = false;
  $: if (isCreate && !slugTouched) roleSlug = slugify(roleName);

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function levelLabel(level: AccessLevel): string {
    return level === 'none'
      ? $_('roleDetail.noAccess')
      : level === 'read'
        ? $_('roleDetail.readOnly')
        : level === 'full'
          ? $_('roleDetail.fullAccess')
          : $_('roleDetail.custom');
  }

  function setAllExpanded(open: boolean) {
    expanded = Object.fromEntries(
      permissionRows.filter((row) => hasExpandableContent(row)).map((row) => [row.key, open]),
    );
  }
  let expanded: Record<string, boolean> = defaultExpanded(getPermissionRows(scope));
  let accessLevelOverrides: Record<string, AccessLevel> = {};

  $: permissionRows = getPermissionRows(scope);
  // `expanded` is read here (not only inside the helper) so Svelte recomputes the tree on toggle
  $: visiblePermissionRows = permissionRows.filter((row) => isRowVisible(row, expanded));
  $: selectedPermissionsKey = selectedPermissions.join('|');
  $: accessLevelKey = `${selectedPermissionsKey}|${JSON.stringify(accessLevelOverrides)}`;

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
    // the scope's own grants (`project:project:*`) cover the entity itself, not its sibling
    // sections, so they must not be inherited by `users`, `roles`, `modules`, ...
    const childRows = sectionChildren(root).flatMap((child) =>
      flattenSection(child, root.section ?? currentScope, 0, [], []),
    );

    return [...rootRows, ...childRows];
  }

  function toStoredPermissions(uiPermissions: readonly string[]): string[] {
    return [
      ...new Set(uiPermissions.map((permission) => toStoredPermissionGrant(permission, scope))),
    ];
  }

  function toUiPermissions(storedPermissions: readonly string[]): string[] {
    const storedSet = new Set(
      storedPermissions.map((permission) => normalizePermissionGrant(permission, scope)),
    );
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

  function isRowVisible(row: PermissionRow, expandedRows: Record<string, boolean>): boolean {
    const ancestors = row.key.split('/').slice(0, -1);
    return ancestors.every((_, index) => expandedRows[ancestors.slice(0, index + 1).join('/')]);
  }

  // pure grouping rows (`modules`, `modules/vault`, ...) carry no grants, so they open by default
  function defaultExpanded(rows: PermissionRow[]): Record<string, boolean> {
    return Object.fromEntries(
      rows
        .filter((row) => row.hasChildren && !row.permissions.length)
        .map((row) => [row.key, true]),
    );
  }

  function hasExpandableContent(row: PermissionRow): boolean {
    return row.hasChildren || row.permissions.length > 0;
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

    return result.type === 'success' ? (result.data as { role?: RoleRow } | undefined) : null;
  }

  async function saveRole(event?: SubmitEvent) {
    event?.preventDefault();
    if (!roleName.trim() || !roleSlug.trim()) {
      toast.error($_('roleDetail.nameRequired'));
      return;
    }
    saving = true;

    try {
      const result = await submitAction(isCreate ? 'createRole' : 'updateRole', {
        id: role?.id ?? '',
        name: roleName.trim(),
        slug: roleSlug.trim(),
        permissions: JSON.stringify(selectedPermissions),
      });

      if (isCreate && result?.role?.id) {
        toast.success($_('roleDetail.saved'), roleName.trim());
        await goto(`${cancelHref}/${result.role.id}`);
        return;
      }

      await invalidateAll();
      toast.success($_('roleDetail.saved'), roleName.trim());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : $_('roleDetail.saveFailed'));
    } finally {
      saving = false;
    }
  }

  async function deleteRole() {
    if (!role) return;

    deleting = true;
    try {
      await submitAction('deleteRole', { id: role.id });
      deleteOpen = false;
      toast.success($_('roleDetail.deleted'), role.name);
      await goto(cancelHref);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : $_('roleDetail.deleteFailed'));
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>{title || $_('roleDetail.defaultTitle')}</title>
</svelte:head>

<form class="space-y-6" on:submit={saveRole}>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <a
        href={cancelHref}
        class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
      >
        <ArrowLeft class="h-3.5 w-3.5" />{$_('roleDetail.backToRoles')}
      </a>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <h1 class="truncate text-2xl font-semibold tracking-tight text-white">
          {isCreate ? $_('roleDetail.newRole') : roleName || role?.name}
        </h1>
        {#if roleIsSystem}
          <span class="k-badge gap-1"><Lock class="h-3 w-3" />{$_('rolePermissions.system')}</span>
        {/if}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if !isCreate && canDelete}
        <button
          type="button"
          class="k-btn k-btn-ghost hover:text-red-400"
          disabled={roleIsSystem}
          title={roleIsSystem ? $_('roleDetail.systemRoleDeleteDisabled') : undefined}
          on:click={() => (deleteOpen = true)}
        >
          <Trash2 class="h-4 w-4" />{$_('common.delete')}
        </button>
      {/if}
      <a href={cancelHref} class="k-btn k-btn-secondary">{$_('common.cancel')}</a>
      {#if canSave}
        <button type="submit" class="k-btn k-btn-primary" disabled={saving}>
          {#if saving}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
              class="h-4 w-4"
            />{/if}
          {isCreate ? $_('roleDetail.createRole') : $_('common.save')}
        </button>
      {/if}
    </div>
  </header>

  <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <section class="k-card h-fit space-y-5 p-5 lg:sticky lg:top-20">
      <h2 class="text-sm font-semibold text-white">
        {scope === 'organization'
          ? $_('roleDetail.orgRoleDetails')
          : scope === 'project'
            ? $_('roleDetail.projectRoleDetails')
            : $_('roleDetail.clusterRoleDetails')}
      </h2>
      {#if canSave}
        <Field id="role-name" label={$_('common.name')} required>
          {#snippet children(control)}
            <input
              {...control}
              class="k-input"
              placeholder={$_('roleDetail.developerPlaceholder')}
              data-autofocus
              bind:value={roleName}
            />
          {/snippet}
        </Field>
        <Field
          id="role-slug"
          label={$_('common.slug')}
          help={isCreate ? $_('roleDetail.slugHelp') : $_('roleDetail.slugLocked')}
        >
          {#snippet children(control)}
            <input
              {...control}
              class="k-input font-mono text-[13px]"
              placeholder="developer"
              readonly={!isCreate}
              bind:value={roleSlug}
              on:input={() => (slugTouched = true)}
            />
          {/snippet}
        </Field>
      {:else}
        <dl class="space-y-4 text-sm">
          <div>
            <dt class="k-label">{$_('common.name')}</dt>
            <dd class="text-fg">{roleName}</dd>
          </div>
          <div>
            <dt class="k-label">{$_('common.slug')}</dt>
            <dd class="font-mono text-fg">{roleSlug}</dd>
          </div>
        </dl>
      {/if}

      <div class="k-divider"></div>
      <dl class="grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-xl border border-white/8 bg-ink-900/60 p-3">
          <dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <KeyRound class="h-3.5 w-3.5" />{$_('roleDetail.permissions')}
          </dt>
          <dd class="mt-1 text-lg font-semibold tabular-nums text-white">
            {selectedPermissions.length}
          </dd>
        </div>
        {#if !isCreate}
          <div class="rounded-xl border border-white/8 bg-ink-900/60 p-3">
            <dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
              <Users class="h-3.5 w-3.5" />{$_('usersComponent.defaultTitle')}
            </dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums text-white">
              {role?.userCount ?? 0}
            </dd>
          </div>
        {/if}
      </dl>
      {#if !isCreate && role?.id}
        <p class="break-all font-mono text-[11px] text-fg-subtle">
          {$_('roleDetail.roleId')}: {role.id}
        </p>
      {/if}
    </section>

    <section class="k-card min-w-0 overflow-hidden">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4"
      >
        <div>
          <h2 class="text-sm font-semibold text-white">{$_('roleDetail.permissions')}</h2>
          <p class="mt-0.5 text-xs text-fg-subtle">{$_('roleDetail.permissionsHelp')}</p>
        </div>
        <div class="flex gap-1">
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-sm"
            on:click={() => setAllExpanded(true)}>{$_('roleDetail.expandAll')}</button
          >
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-sm"
            on:click={() => setAllExpanded(false)}>{$_('roleDetail.collapseAll')}</button
          >
        </div>
      </div>

      <ul class="divide-y divide-white/5">
        {#each visiblePermissionRows as permissionRow (permissionRow.key)}
          <li>
            <div
              class="flex flex-wrap items-center gap-3 py-2.5 pr-5"
              style={`padding-left: ${1 + permissionRow.depth * 1.5}rem;`}
            >
              {#if hasExpandableContent(permissionRow)}
                <button
                  type="button"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm -ml-1"
                  aria-expanded={Boolean(expanded[permissionRow.key])}
                  aria-label={expanded[permissionRow.key]
                    ? $_('roleDetail.collapseSection')
                    : $_('roleDetail.expandSection')}
                  on:click={() => toggleExpanded(permissionRow)}
                >
                  {#if expanded[permissionRow.key]}<ChevronDown
                      class="h-4 w-4"
                    />{:else}<ChevronRight class="h-4 w-4" />{/if}
                </button>
              {:else}
                <span class="w-7"></span>
              {/if}
              <span
                class="min-w-0 flex-1 truncate text-sm capitalize {permissionRow.permissions.length
                  ? 'font-medium text-white'
                  : 'text-fg-subtle'}">{rowLabel(permissionRow)}</span
              >

              {#if permissionRow.permissions.length}
                {#key `${permissionRow.key}:${accessLevelKey}`}
                  {@const level = accessLevel(permissionRow)}
                  {#if hasInheritedAccess(permissionRow)}
                    <span class="k-badge k-badge-info h-6 px-2 text-[11px]"
                      >{$_('roleDetail.inherited')}</span
                    >
                  {:else}
                    <div
                      class="inline-flex rounded-[0.625rem] border border-white/10 bg-ink-900 p-0.5"
                      role="radiogroup"
                      aria-label={rowLabel(permissionRow)}
                    >
                      {#each selectableAccessLevels(permissionRow) as option}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={level === option}
                          disabled={!canSave}
                          class="h-7 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-default {level ===
                          option
                            ? option === 'none'
                              ? 'bg-white/10 text-white'
                              : 'bg-brand-500/20 text-brand-200'
                            : 'text-fg-subtle hover:text-fg'}"
                          on:click={() => setAccessLevel(permissionRow, option)}
                          >{levelLabel(option)}</button
                        >
                      {/each}
                    </div>
                  {/if}
                {/key}
              {/if}
            </div>

            {#if expanded[permissionRow.key] && permissionRow.permissions.length}
              <div
                class="flex flex-wrap gap-2 pb-3 pr-5"
                style={`padding-left: ${3 + permissionRow.depth * 1.5}rem;`}
              >
                {#each visibleRowPermissions(permissionRow) as permission}
                  {@const action = actionFrom(permission)}
                  {#key `${permission}:${accessLevelKey}`}
                    {@const checked = isVisiblePermissionSelected(permissionRow, permission)}
                    <label
                      class="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors has-disabled:cursor-default has-disabled:opacity-60 {checked
                        ? 'border-brand-500/40 bg-brand-500/10 text-brand-100'
                        : 'border-white/10 text-fg-muted hover:border-white/20'}"
                      title={inheritedPermission(permissionRow, action) ?? permission}
                    >
                      <input
                        type="checkbox"
                        class="k-checkbox"
                        {checked}
                        disabled={isPermissionDisabled(permissionRow, permission) || !canSave}
                        on:change={() => togglePermission(permissionRow, permission)}
                      />
                      {action}
                    </label>
                  {/key}
                {/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  </div>
</form>

{#if role}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    dismissible={!deleting}
    title={$_('roleDetail.deleteTitle')}
    description={$_('roleDetail.deleteDescription', {
      values: { name: role.name, count: role.userCount ?? 0 },
    })}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" on:click={() => (deleteOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="button"
        class="k-btn k-btn-danger"
        disabled={deleting}
        data-autofocus
        on:click={deleteRole}
      >
        {#if deleting}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('common.delete')}
      </button>
    {/snippet}
  </Modal>
{/if}
