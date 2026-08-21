<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import { CheckCircle, Plus, Search, UserPlus, Users as UsersIcon } from 'lucide-svelte';

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

    if (scope === 'organization' && (!newUsername.trim() || !newPassword.trim())) {
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
      flashSuccess(scope === 'organization' ? 'User created.' : 'User assigned.');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to add user.';
    } finally {
      adding = false;
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

<div class="space-y-6">
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
      {scope === 'organization' ? 'New user' : 'Add user'}
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
    <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Role</th>
              <th class="px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.id)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                <td class="px-4 py-3 text-slate-600">{user.email || '-'}</td>
                <td class="px-4 py-3 text-slate-600">{user.role?.name ?? '-'}</td>
                <td class="px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
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
          {scope === 'organization' ? 'New user' : 'Add user'}
        </h5>
      </div>
      <div class="space-y-4 px-4 py-4">
        {#if scope === 'organization'}
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
