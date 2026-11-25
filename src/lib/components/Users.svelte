<!--
  Usuarios con acceso (GitOps, organización o proyecto): lista con búsqueda, cambio de rol en
  línea, alta/invitación en modal y confirmación para quitar acceso.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import {
    Check,
    ChevronDown,
    LoaderCircle,
    Mail,
    Plus,
    Search,
    Send,
    Trash2,
    UserPlus,
    UserX,
    Users as UsersIcon,
  } from '@lucide/svelte';
  import {
    DropdownMenu,
    Field,
    MenuItem,
    Modal,
    Select,
    toast,
    type SelectOption,
  } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  type UserScope = 'cluster' | 'organization' | 'project';
  type RoleRow = { id: string; name: string; slug: string };
  type AccessUserRow = {
    id: string;
    userId: string;
    username: string;
    email: string | null;
    role: RoleRow | null;
    organizations?: Array<{ id: string; name: string; slug: string; role: string | null }>;
    status: 'active' | 'invited';
    createdAt: string;
  };
  type AssignableUserRow = { id: string; username: string; email: string | null };

  type Props = {
    scope: UserScope;
    initialUsers?: AccessUserRow[];
    roles?: RoleRow[];
    assignableUsers?: AssignableUserRow[];
    title?: string;
    description?: string;
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
  };

  let {
    scope,
    initialUsers = [],
    roles = [],
    assignableUsers = [],
    title = '',
    description = '',
    canCreate = true,
    canUpdate = false,
    canDelete = true,
  }: Props = $props();

  // cambio de rol optimista: se pinta el rol elegido mientras se guarda y hasta que llega la recarga
  let roleOverrides = $state<Record<string, RoleRow>>({});
  const users = $derived(
    initialUsers.map((user) =>
      roleOverrides[user.id] ? { ...user, role: roleOverrides[user.id] } : user,
    ),
  );

  let searchQuery = $state('');
  let savingAccessId = $state<string | null>(null);
  let resendingAccessId = $state<string | null>(null);

  let addOpen = $state(false);
  let adding = $state(false);
  let addError = $state('');
  let newUsername = $state('');
  let newEmail = $state('');
  let newPassword = $state('');
  let selectedUserId = $state('');
  let selectedRoleId = $state('');

  let inviteOpen = $state(false);
  let inviting = $state(false);
  let inviteError = $state('');
  let inviteEmail = $state('');

  let removeOpen = $state(false);
  let removing = $state(false);
  let removeUser = $state<AccessUserRow | null>(null);

  const resolvedTitle = $derived(title || $_('usersComponent.defaultTitle'));
  const normalize = (value: string) => value.toLowerCase();

  const filteredUsers = $derived.by(() => {
    const query = normalize(searchQuery.trim());
    if (!query) return users;
    return users.filter(
      (user) =>
        normalize(user.username).includes(query) ||
        normalize(user.email ?? '').includes(query) ||
        normalize(user.role?.name ?? '').includes(query) ||
        normalize(user.role?.slug ?? '').includes(query) ||
        (user.organizations ?? []).some(
          (organization) =>
            normalize(organization.name).includes(query) ||
            normalize(organization.slug).includes(query) ||
            normalize(organization.role ?? '').includes(query),
        ),
    );
  });
  const availableUsers = $derived(
    assignableUsers.filter((user) => !users.some((access) => access.userId === user.id)),
  );
  const userOptions: SelectOption[] = $derived(
    availableUsers.map((user) => ({
      value: user.id,
      label: user.username,
      hint: user.email ?? undefined,
    })),
  );
  const roleOptions: SelectOption[] = $derived(
    roles.map((role) => ({ value: role.id, label: role.name })),
  );

  function initials(name: string) {
    return name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function formatDate(value: string) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }

  async function submitAction(action: string, values: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);
    const response = await fetch(`?/${action}`, { method: 'POST', body: formData });
    const result = deserialize(await response.text());
    if (result.type === 'failure' || result.type === 'error') {
      const data = result.type === 'failure' ? result.data : null;
      throw new Error(
        typeof data?.error === 'string' ? data.error : $_('usersComponent.actionFailed'),
      );
    }
    await invalidateAll();
  }

  function openAdd() {
    addError = '';
    newUsername = '';
    newEmail = '';
    newPassword = '';
    selectedUserId = '';
    selectedRoleId = roles[0]?.id ?? '';
    addOpen = true;
  }

  async function addUser(event: SubmitEvent) {
    event.preventDefault();
    addError = '';
    if (!selectedRoleId) return void (addError = $_('usersComponent.roleRequired'));
    if (scope !== 'project' && (!newUsername.trim() || !newPassword.trim())) {
      return void (addError = $_('usersComponent.usernamePasswordRequired'));
    }
    if (scope === 'project' && !selectedUserId) {
      return void (addError = $_('usersComponent.userRequired'));
    }
    adding = true;
    try {
      await submitAction('addUser', {
        roleId: selectedRoleId,
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        userId: selectedUserId,
      });
      addOpen = false;
      toast.success(
        scope === 'project' ? $_('usersComponent.userAssigned') : $_('usersComponent.userCreated'),
      );
    } catch (err: unknown) {
      addError = err instanceof Error ? err.message : $_('usersComponent.addFailed');
    } finally {
      adding = false;
    }
  }

  async function inviteUser(event: SubmitEvent) {
    event.preventDefault();
    inviteError = '';
    if (!inviteEmail.trim()) return void (inviteError = $_('usersComponent.emailRequired'));
    inviting = true;
    try {
      await submitAction('inviteUser', { email: inviteEmail.trim() });
      inviteOpen = false;
      toast.success($_('usersComponent.invitationSent'), inviteEmail.trim());
    } catch (err: unknown) {
      inviteError = err instanceof Error ? err.message : $_('usersComponent.inviteFailed');
    } finally {
      inviting = false;
    }
  }

  async function selectRole(user: AccessUserRow, role: RoleRow) {
    if (user.role?.id === role.id) return;
    roleOverrides[user.id] = role;
    savingAccessId = user.id;
    try {
      await submitAction('updateUserAccess', {
        accessId: user.id,
        roleId: role.id,
        status: user.status,
      });
      toast.success($_('usersComponent.roleUpdated'), `${user.username} · ${role.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : $_('usersComponent.updateAccessFailed'));
    } finally {
      delete roleOverrides[user.id];
      savingAccessId = null;
    }
  }

  async function resendInvitation(user: AccessUserRow) {
    resendingAccessId = user.id;
    try {
      await submitAction('resendInvitation', { accessId: user.id });
      toast.success($_('usersComponent.invitationResent'), user.email ?? user.username);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : $_('usersComponent.resendFailed'));
    } finally {
      resendingAccessId = null;
    }
  }

  async function confirmRemove() {
    if (!removeUser) return;
    removing = true;
    try {
      await submitAction('removeUserAccess', { accessId: removeUser.id });
      toast.success($_('usersComponent.accessRemoved'), removeUser.username);
      removeOpen = false;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : $_('usersComponent.removeAccessFailed'));
    } finally {
      removing = false;
    }
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
        {description || $_('usersComponent.defaultDescription')}
      </p>
    </div>
    {#if canCreate}
      <div class="flex shrink-0 items-center gap-2">
        {#if scope === 'organization'}
          <button
            type="button"
            class="k-btn k-btn-secondary"
            onclick={() => {
              inviteError = '';
              inviteEmail = '';
              inviteOpen = true;
            }}
          >
            <Mail class="h-4 w-4" />{$_('usersComponent.inviteUser')}
          </button>
        {/if}
        <button type="button" class="k-btn k-btn-primary" onclick={openAdd}>
          <Plus class="h-4 w-4" />
          {scope === 'project' ? $_('usersComponent.addUser') : $_('usersComponent.newUser')}
        </button>
      </div>
    {/if}
  </header>

  <div class="k-card">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <label class="relative w-full sm:w-80">
        <span class="sr-only">{$_('usersComponent.searchPlaceholder')}</span>
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          class="k-input h-9 pl-9"
          placeholder={$_('usersComponent.searchPlaceholder')}
          bind:value={searchQuery}
        />
      </label>
      <span class="ml-auto text-xs text-fg-subtle">
        {$_('usersComponent.count', { values: { count: users.length } })}
      </span>
    </div>

    {#if filteredUsers.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-fg-subtle">
          <UsersIcon class="h-6 w-6" />
        </span>
        <p class="text-sm font-medium text-fg">
          {users.length === 0 ? $_('usersComponent.empty') : $_('usersComponent.emptySearch')}
        </p>
        {#if users.length === 0 && canCreate}
          <button type="button" class="k-btn k-btn-secondary k-btn-sm" onclick={openAdd}>
            <Plus class="h-3.5 w-3.5" />
            {scope === 'project' ? $_('usersComponent.addUser') : $_('usersComponent.newUser')}
          </button>
        {/if}
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-176 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">{$_('usersComponent.user')}</th>
              {#if scope === 'cluster'}
                <th class="px-3 py-3 font-semibold">{$_('usersComponent.organizations')}</th>
              {/if}
              <th class="px-3 py-3 font-semibold">{$_('common.role')}</th>
              <th class="px-3 py-3 font-semibold">{$_('common.status')}</th>
              <th class="px-3 py-3 font-semibold">{$_('usersComponent.added')}</th>
              <th class="px-5 py-3"><span class="sr-only">{$_('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each filteredUsers as user (user.id)}
              <tr class="transition-colors hover:bg-white/2.5">
                <td class="px-5 py-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-ink-500 to-ink-700 text-[11px] font-semibold text-white"
                      aria-hidden="true">{initials(user.username)}</span
                    >
                    <span class="min-w-0">
                      <span class="block truncate font-medium text-white">{user.username}</span>
                      <span class="block truncate text-xs text-fg-subtle">{user.email || '—'}</span>
                    </span>
                  </div>
                </td>
                {#if scope === 'cluster'}
                  <td class="px-3 py-3">
                    {#if user.organizations?.length}
                      <div class="flex max-w-md flex-wrap gap-1.5">
                        {#each user.organizations as organization (organization.id)}
                          <span class="k-badge h-6 gap-1 px-2 text-[11px]">
                            {organization.name}
                            {#if organization.role}<span class="text-fg-subtle"
                                >· {organization.role}</span
                              >{/if}
                          </span>
                        {/each}
                      </div>
                    {:else}
                      <span class="text-fg-subtle">—</span>
                    {/if}
                  </td>
                {/if}
                <td class="px-3 py-3">
                  {#if canUpdate && roles.length > 0}
                    <DropdownMenu
                      label={$_('usersComponent.changeRole', {
                        values: { name: user.username },
                      })}
                      class="w-56 p-1.5"
                    >
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          class="k-btn k-btn-secondary k-btn-sm min-w-40 justify-between"
                          disabled={savingAccessId === user.id}
                        >
                          <span class="truncate"
                            >{user.role?.name ?? $_('usersComponent.selectRole')}</span
                          >
                          {#if savingAccessId === user.id}<LoaderCircle
                              class="h-3.5 w-3.5 animate-spin"
                            />{:else}<ChevronDown class="h-3.5 w-3.5 text-fg-subtle" />{/if}
                        </button>
                      {/snippet}
                      {#each roles as role (role.id)}
                        <MenuItem
                          icon={user.role?.id === role.id ? Check : undefined}
                          tone={user.role?.id === role.id ? 'brand' : 'default'}
                          onclick={() => selectRole(user, role)}>{role.name}</MenuItem
                        >
                      {/each}
                    </DropdownMenu>
                  {:else}
                    <span class="k-badge">{user.role?.name ?? '—'}</span>
                  {/if}
                </td>
                <td class="px-3 py-3">
                  <span class="k-badge {user.status === 'invited' ? 'k-badge-warn' : 'k-badge-ok'}">
                    {user.status === 'invited' ? $_('usersComponent.invited') : $_('common.active')}
                  </span>
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-muted"
                  >{formatDate(user.createdAt)}</td
                >
                <td class="px-5 py-3">
                  <div class="flex items-center justify-end gap-1">
                    {#if user.status === 'invited' && canCreate}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-sm"
                        disabled={resendingAccessId === user.id}
                        onclick={() => resendInvitation(user)}
                      >
                        {#if resendingAccessId === user.id}<LoaderCircle
                            class="h-3.5 w-3.5 animate-spin"
                          />{:else}<Send class="h-3.5 w-3.5" />{/if}
                        {$_('usersComponent.resendInvitation')}
                      </button>
                    {/if}
                    {#if canDelete}
                      <button
                        type="button"
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                        title={$_('usersComponent.removeAccess')}
                        aria-label="{$_('usersComponent.removeAccess')}: {user.username}"
                        onclick={() => {
                          removeUser = user;
                          removeOpen = true;
                        }}
                      >
                        <UserX class="h-4 w-4" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<Modal
  bind:open={addOpen}
  dismissible={!adding}
  title={scope === 'project' ? $_('usersComponent.addUser') : $_('usersComponent.newUser')}
  description={scope === 'project'
    ? $_('usersComponent.addProjectDescription')
    : $_('usersComponent.newUserDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><UserPlus class="h-5 w-5" /></span
    >
  {/snippet}
  <form id="add-user-form" class="space-y-5" onsubmit={addUser}>
    {#if addError}
      <p
        class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        {addError}
      </p>
    {/if}
    {#if scope === 'project'}
      {#if availableUsers.length === 0}
        <p class="text-sm text-fg-muted">{$_('usersComponent.noAssignableUsers')}</p>
      {:else}
        <Field label={$_('usersComponent.user')} id="existing-user" required>
          {#snippet children(control)}
            <Select
              id={control.id}
              options={userOptions}
              searchable
              placeholder={$_('usersComponent.chooseUser')}
              searchPlaceholder={$_('usersComponent.searchPlaceholder')}
              bind:value={selectedUserId}
            />
          {/snippet}
        </Field>
      {/if}
    {:else}
      <div class="grid gap-5 sm:grid-cols-2">
        <Field label={$_('common.username')} id="new-user-name" required>
          {#snippet children(control)}
            <input
              {...control}
              class="k-input"
              autocomplete="off"
              data-autofocus
              bind:value={newUsername}
            />
          {/snippet}
        </Field>
        <Field label={$_('common.email')} id="new-user-email">
          {#snippet children(control)}
            <input {...control} type="email" class="k-input" bind:value={newEmail} />
          {/snippet}
        </Field>
      </div>
      <Field label={$_('common.password')} id="new-user-password" required>
        {#snippet children(control)}
          <input
            {...control}
            type="password"
            class="k-input"
            autocomplete="new-password"
            bind:value={newPassword}
          />
        {/snippet}
      </Field>
    {/if}
    <Field label={$_('common.role')} id="user-role" required>
      {#snippet children(control)}
        <Select id={control.id} options={roleOptions} bind:value={selectedRoleId} />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (addOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      form="add-user-form"
      class="k-btn k-btn-primary"
      disabled={adding ||
        roles.length === 0 ||
        (scope === 'project' && availableUsers.length === 0)}
    >
      {#if adding}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<UserPlus
          class="h-4 w-4"
        />{/if}
      {$_('usersComponent.addUser')}
    </button>
  {/snippet}
</Modal>

<Modal
  bind:open={inviteOpen}
  size="sm"
  dismissible={!inviting}
  title={$_('usersComponent.inviteModalTitle')}
  description={$_('usersComponent.inviteModalDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><Mail class="h-5 w-5" /></span
    >
  {/snippet}
  <form id="invite-user-form" onsubmit={inviteUser}>
    <Field label={$_('common.email')} id="invite-user-email" error={inviteError || null}>
      {#snippet children(control)}
        <input
          {...control}
          type="email"
          class="k-input"
          placeholder="user@example.com"
          data-autofocus
          bind:value={inviteEmail}
        />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (inviteOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="invite-user-form" class="k-btn k-btn-primary" disabled={inviting}>
      {#if inviting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Send
          class="h-4 w-4"
        />{/if}
      {$_('usersComponent.sendInvitation')}
    </button>
  {/snippet}
</Modal>

<Modal
  bind:open={removeOpen}
  role="alertdialog"
  size="sm"
  dismissible={!removing}
  title={$_('usersComponent.removeModalTitle')}
  description={removeUser
    ? `${$_('usersComponent.removeModalDescriptionStart')} ${removeUser.username}${$_('usersComponent.removeModalDescriptionEnd')}`
    : undefined}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (removeOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      type="button"
      class="k-btn k-btn-danger"
      disabled={removing}
      data-autofocus
      onclick={confirmRemove}
    >
      {#if removing}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {$_('usersComponent.removeAccess')}
    </button>
  {/snippet}
</Modal>
