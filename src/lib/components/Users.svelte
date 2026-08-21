<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import {
    ChevronDown,
    CheckCircle,
    Plus,
    Search,
    Send,
    Trash2,
    UserPlus,
    Users as UsersIcon,
  } from 'lucide-svelte';

  type UserScope = 'cluster' | 'organization' | 'project';

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
  };

  type AccessUserRow = {
    id: string;
    userId: string;
    username: string;
    email: string | null;
    role: RoleRow | null;
    status: 'active' | 'invited';
    createdAt: string;
  };

  type AssignableUserRow = {
    id: string;
    username: string;
    email: string | null;
    role?: RoleRow | null;
  };

  export let scope: UserScope;
  export let initialUsers: AccessUserRow[] = [];
  export let roles: RoleRow[] = [];
  export let assignableUsers: AssignableUserRow[] = [];
  export let title = 'Users';
  export let description = 'Manage user access.';

  let users: AccessUserRow[] = initialUsers;
  let searchQuery = '';
  let error = '';
  let success = '';
  let addModalOpen = false;
  let adding = false;
  let savingAccessId: string | null = null;
  let removingAccessId: string | null = null;
  let resendingAccessId: string | null = null;
  let openRoleMenuId: string | null = null;
  let removeModalUser: AccessUserRow | null = null;

  let newUsername = '';
  let newEmail = '';
  let newPassword = '';
  let selectedUserId = '';
  let selectedRoleId = '';

  $: users = initialUsers;
  $: filteredUsers = users.filter((user) => {
    const query = searchQuery.trim().toLowerCase();
    return (
      !query ||
      user.username.toLowerCase().includes(query) ||
      (user.email ?? '').toLowerCase().includes(query) ||
      (user.role?.name ?? '').toLowerCase().includes(query) ||
      (user.role?.slug ?? '').toLowerCase().includes(query)
    );
  });
  $: availableUsers = assignableUsers.filter(
    (user) => !users.some((accessUser) => accessUser.userId === user.id),
  );

  function openAddModal() {
    error = '';
    newUsername = '';
    newEmail = '';
    newPassword = '';
    selectedUserId = availableUsers[0]?.id ?? '';
    selectedRoleId = roles[0]?.id ?? '';
    addModalOpen = true;
  }

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  async function submitAction(action: string, values: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);

    const response = await fetch(`?/${action}`, { method: 'POST', body: formData });
    const result = deserialize(await response.text());
    if (result.type === 'failure' || result.type === 'error') {
      const data = result.type === 'failure' ? result.data : null;
      throw new Error(typeof data?.error === 'string' ? data.error : 'User action failed.');
    }
    await invalidateAll();
  }

  async function addUser() {
    error = '';
    success = '';

    if (!selectedRoleId) {
      error = 'Role is required.';
      return;
    }

    if (scope !== 'project' && (!newUsername.trim() || !newPassword.trim())) {
      error = 'Username and password are required.';
      return;
    }

    if (scope === 'project' && !selectedUserId) {
      error = 'User is required.';
      return;
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
      addModalOpen = false;
      flashSuccess(scope === 'project' ? 'User assigned.' : 'User created.');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to add user.';
    } finally {
      adding = false;
    }
  }

  async function selectRole(user: AccessUserRow, role: RoleRow) {
    if (user.role?.id === role.id) {
      openRoleMenuId = null;
      return;
    }

    const previousRole = user.role;
    user.role = role;
    users = users;
    openRoleMenuId = null;

    error = '';
    success = '';
    savingAccessId = user.id;
    try {
      await submitAction('updateUserAccess', {
        accessId: user.id,
        roleId: role.id,
        status: user.status,
      });
      flashSuccess('Role updated.');
    } catch (err: unknown) {
      user.role = previousRole;
      users = users;
      error = err instanceof Error ? err.message : 'Failed to update user access.';
    } finally {
      savingAccessId = null;
    }
  }

  function openRemoveModal(user: AccessUserRow) {
    error = '';
    removeModalUser = user;
  }

  async function confirmRemoveAccess() {
    if (!removeModalUser) return;

    error = '';
    success = '';
    removingAccessId = removeModalUser.id;
    try {
      await submitAction('removeUserAccess', { accessId: removeModalUser.id });
      removeModalUser = null;
      flashSuccess('User access removed.');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to remove user access.';
    } finally {
      removingAccessId = null;
    }
  }

  function statusClasses(status: AccessUserRow['status']) {
    return status === 'invited'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  async function resendInvitation(user: AccessUserRow) {
    error = '';
    success = '';
    resendingAccessId = user.id;
    try {
      await submitAction('resendInvitation', { accessId: user.id });
      flashSuccess('Invitation resent.');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to resend invitation.';
    } finally {
      resendingAccessId = null;
    }
  }

  function formatDate(value: string) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="flex min-h-[calc(100dvh-22rem)] flex-col gap-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">{title}</h3>
      <p class="mt-2 text-sm text-slate-600">{description}</p>
    </div>
    <button
      type="button"
      on:click={openAddModal}
      class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
    >
      <Plus class="h-4 w-4" />
      {scope === 'project' ? 'Add user' : 'New user'}
    </button>
  </section>

  <section class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search by user, email or role..."
        class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
      />
    </div>
  </section>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  {#if filteredUsers.length === 0}
    <div
      class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
    >
      <UsersIcon class="h-8 w-8 text-slate-400" />
      <p class="text-sm font-medium text-slate-700">
        {users.length === 0 ? 'No users found.' : 'No users match your search.'}
      </p>
    </div>
  {:else}
    <div class="relative flex-1 overflow-visible rounded-md border border-slate-200 bg-white">
      <div class="overflow-x-auto overflow-y-visible pb-24">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Role</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Added</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.id)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                <td class="px-4 py-3 text-slate-600">{user.email || '-'}</td>
                <td class="px-4 py-3 text-slate-600">
                  <div class="relative inline-block text-left">
                    <button
                      type="button"
                      on:click={() =>
                        (openRoleMenuId = openRoleMenuId === user.id ? null : user.id)}
                      disabled={savingAccessId === user.id || roles.length === 0}
                      class="btn-secondary inline-flex min-w-44 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm font-medium"
                    >
                      <span class="truncate">{user.role?.name ?? 'Select role'}</span>
                      <ChevronDown class="h-4 w-4 shrink-0" />
                    </button>
                    {#if openRoleMenuId === user.id}
                      <div
                        class="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
                      >
                        {#each roles as role (role.id)}
                          <button
                            type="button"
                            on:click={() => selectRole(user, role)}
                            class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-slate-50 {user
                              .role?.id === role.id
                              ? 'font-medium text-slate-950'
                              : 'text-slate-600'}"
                          >
                            <span class="truncate">{role.name}</span>
                            {#if user.role?.id === role.id}
                              <CheckCircle class="h-4 w-4 text-emerald-600" />
                            {/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-3 text-slate-600">
                  <span
                    class={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                      user.status,
                    )}`}
                  >
                    <span
                      class={`h-2 w-2 rounded-full ${user.status === 'invited' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    ></span>
                    {user.status === 'invited' ? 'Invited' : 'Active'}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    {#if user.status === 'invited'}
                      <button
                        type="button"
                        on:click={() => resendInvitation(user)}
                        disabled={resendingAccessId === user.id}
                        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      >
                        <Send class="h-3.5 w-3.5" />
                        {resendingAccessId === user.id ? 'Sending...' : 'Resend Invitation'}
                      </button>
                    {/if}
                    <button
                      type="button"
                      on:click={() => openRemoveModal(user)}
                      disabled={removingAccessId === user.id}
                      class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                      {removingAccessId === user.id ? 'Removing...' : 'Remove access'}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

{#if addModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={() => (addModalOpen = false)}
    aria-label="Close add user modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Add user modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">
          {scope === 'project' ? 'Add user' : 'New user'}
        </h5>
      </div>
      <div class="space-y-4 px-4 py-4">
        {#if scope !== 'project'}
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-slate-700" for="new-user-name">
                Username
              </label>
              <input
                id="new-user-name"
                type="text"
                bind:value={newUsername}
                class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700" for="new-user-email">
                Email
              </label>
              <input
                id="new-user-email"
                type="email"
                bind:value={newEmail}
                class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-user-password">
              Password
            </label>
            <input
              id="new-user-password"
              type="password"
              bind:value={newPassword}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          </div>
        {:else}
          <div>
            <label class="block text-sm font-medium text-slate-700" for="existing-user">
              User
            </label>
            <select
              id="existing-user"
              bind:value={selectedUserId}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            >
              {#each availableUsers as user (user.id)}
                <option value={user.id}
                  >{user.username}{user.email ? ` (${user.email})` : ''}</option
                >
              {/each}
            </select>
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-slate-700" for="user-role">Role</label>
          <select
            id="user-role"
            bind:value={selectedRoleId}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          >
            {#each roles as role (role.id)}
              <option value={role.id}>{role.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={() => (addModalOpen = false)}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={addUser}
          disabled={adding ||
            roles.length === 0 ||
            (scope === 'project' && availableUsers.length === 0)}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <UserPlus class="h-4 w-4" />
          {adding ? 'Adding...' : 'Add user'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if removeModalUser}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={() => (removeModalUser = null)}
    aria-label="Close remove access confirmation"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Remove access confirmation"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Remove access</h5>
      </div>
      <div class="px-4 py-4">
        <p class="text-sm text-slate-700">
          Remove access for <span class="font-semibold text-slate-900"
            >{removeModalUser.username}</span
          >? This will revoke this scope assignment.
        </p>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={() => (removeModalUser = null)}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={confirmRemoveAccess}
          disabled={removingAccessId === removeModalUser.id}
          class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Trash2 class="h-4 w-4" />
          {removingAccessId === removeModalUser.id ? 'Removing...' : 'Remove access'}
        </button>
      </div>
    </div>
  </div>
{/if}
