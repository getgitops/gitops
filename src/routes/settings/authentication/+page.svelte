<script lang="ts">
  import { onMount } from 'svelte';
  import {
    CheckCircle,
    RefreshCw,
    Shield,
    Building2,
    KeyRound,
    Users,
    Search,
    Plus,
    Trash2,
    LockKeyhole,
  } from 'lucide-svelte';

  type ManagedUser = {
    id: string;
    username: string;
    email: string | null;
    role: string;
    created_at: string;
  };

  let googleSsoEnabled = false;
  let googleClientId = '';
  let googleClientSecret = '';

  let samlEnabled = false;
  let samlEntryPoint = '';
  let samlIssuer = '';
  let samlCert = '';

  let configError = '';
  let isSaving = false;
  let saveSuccess = false;

  let users: ManagedUser[] = [];
  let usersLoading = false;
  let searchQuery = '';

  let newUsername = '';
  let newPassword = '';
  let newRole = 'developer';
  let creatingUser = false;
  let createUserModalOpen = false;

  let userError = '';
  let userSuccess = '';
  let passwordModalUser: ManagedUser | null = null;
  let passwordModalValue = '';
  let passwordModalLoading = false;

  let deleteModalUser: ManagedUser | null = null;
  let deleteModalLoading = false;

  $: filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return user.username.toLowerCase().includes(q) || user.role.toLowerCase().includes(q);
  });

  onMount(async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();

      if (data.configured && data.config) {
        googleSsoEnabled = !!data.config.googleSsoEnabled;
        googleClientId = data.config.googleClientId || '';
        googleClientSecret = data.config.googleClientSecret || '';

        samlEnabled = !!data.config.samlEnabled;
        samlEntryPoint = data.config.samlEntryPoint || '';
        samlIssuer = data.config.samlIssuer || '';
        samlCert = data.config.samlCert || '';
      }
    } catch (error) {
      console.error('Error fetching auth config', error);
    }

    await fetchUsers();
  });

  async function fetchUsers() {
    usersLoading = true;

    try {
      const res = await fetch('/api/users');
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);
      users = payload.users || [];
    } catch (error) {
      console.error('Error fetching users', error);
      userError = 'Failed to load users.';
    } finally {
      usersLoading = false;
    }
  }

  function flashUserSuccess(message: string) {
    userSuccess = message;
    setTimeout(() => {
      userSuccess = '';
    }, 2500);
  }

  async function createUser() {
    userError = '';
    userSuccess = '';

    if (!newUsername.trim() || !newPassword.trim()) {
      userError = 'Username and password are required.';
      return;
    }

    creatingUser = true;
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      newUsername = '';
      newPassword = '';
      newRole = 'developer';
      createUserModalOpen = false;

      flashUserSuccess('User created.');
      await fetchUsers();
    } catch (error: unknown) {
      userError = error instanceof Error ? error.message : 'Failed to create user.';
    } finally {
      creatingUser = false;
    }
  }

  function openCreateUserModal() {
    userError = '';
    createUserModalOpen = true;
  }

  function closeCreateUserModal() {
    createUserModalOpen = false;
    newUsername = '';
    newPassword = '';
    newRole = 'developer';
  }

  async function updateRole(userId: string, role: string) {
    userError = '';
    userSuccess = '';

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      flashUserSuccess('Role updated.');
      await fetchUsers();
    } catch (error: unknown) {
      userError = error instanceof Error ? error.message : 'Failed to update role.';
      await fetchUsers();
    }
  }

  function handleRoleChange(userId: string, event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    updateRole(userId, select.value);
  }

  function openPasswordModal(user: ManagedUser) {
    passwordModalUser = user;
    passwordModalValue = '';
    userError = '';
  }

  function closePasswordModal() {
    passwordModalUser = null;
    passwordModalValue = '';
  }

  async function submitChangePassword() {
    if (!passwordModalUser) return;

    userError = '';
    userSuccess = '';

    if (!passwordModalValue.trim()) {
      userError = 'Password cannot be empty.';
      return;
    }

    passwordModalLoading = true;
    try {
      const res = await fetch(`/api/users/${passwordModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordModalValue }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      closePasswordModal();
      flashUserSuccess('Password updated.');
      await fetchUsers();
    } catch (error: unknown) {
      userError = error instanceof Error ? error.message : 'Failed to update password.';
    } finally {
      passwordModalLoading = false;
    }
  }

  function openDeleteModal(user: ManagedUser) {
    deleteModalUser = user;
    userError = '';
  }

  function closeDeleteModal() {
    deleteModalUser = null;
  }

  async function confirmDeleteUser() {
    if (!deleteModalUser) return;

    userError = '';
    userSuccess = '';

    deleteModalLoading = true;

    try {
      const res = await fetch(`/api/users/${deleteModalUser.id}`, { method: 'DELETE' });
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      closeDeleteModal();
      flashUserSuccess('User deleted.');
      await fetchUsers();
    } catch (error: unknown) {
      userError = error instanceof Error ? error.message : 'Failed to delete user.';
    } finally {
      deleteModalLoading = false;
    }
  }

  async function saveSettings() {
    isSaving = true;
    configError = '';
    saveSuccess = false;

    try {
      const payload = {
        googleSsoEnabled,
        googleClientId,
        googleClientSecret,
        samlEnabled,
        samlEntryPoint,
        samlIssuer,
        samlCert,
      };

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      saveSuccess = true;
      setTimeout(() => {
        saveSuccess = false;
      }, 3000);
    } catch (error: any) {
      configError = error?.message || 'Failed to save authentication settings.';
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Autentication - Settings</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Autentication</h3>
    <p class="mt-2 text-sm text-slate-600">
      Local login is always enabled. Optionally connect GCP Workspace and SAML as additional
      providers.
    </p>
  </section>

  <section class="rounded-md border border-emerald-200 bg-emerald-50 p-4">
    <div class="flex items-start gap-3">
      <Shield class="mt-0.5 h-5 w-5 text-emerald-700" />
      <div>
        <p class="text-sm font-semibold text-emerald-900">Local authentication: always ON</p>
        <p class="mt-1 text-sm text-emerald-800">
          Username/password access remains available even when external providers are enabled.
        </p>
      </div>
    </div>
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
      <input
        id="google-sso"
        type="checkbox"
        bind:checked={googleSsoEnabled}
        class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
      />
      <div class="flex-1">
        <label for="google-sso" class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
          <Building2 class="h-4 w-4" />
          GCP Workspace (Google SSO)
        </label>
        <p class="mt-1 text-sm text-slate-600">
          Allow users to authenticate with Google Workspace accounts.
        </p>
      </div>
    </div>

    {#if googleSsoEnabled}
      <div class="space-y-4 bg-slate-50 px-4 py-4">
        <div>
          <label for="google-client-id" class="block text-sm font-medium text-slate-700">Google Client ID</label>
          <input
            id="google-client-id"
            type="text"
            bind:value={googleClientId}
            class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="123456789-abc.apps.googleusercontent.com"
          />
        </div>

        <div>
          <label for="google-client-secret" class="block text-sm font-medium text-slate-700">Google Client Secret</label>
          <input
            id="google-client-secret"
            type="password"
            bind:value={googleClientSecret}
            class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="••••••••"
          />
        </div>
      </div>
    {/if}
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
      <input
        id="saml-enabled"
        type="checkbox"
        bind:checked={samlEnabled}
        class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
      />
      <div class="flex-1">
        <label for="saml-enabled" class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
          <KeyRound class="h-4 w-4" />
          SAML
        </label>
        <p class="mt-1 text-sm text-slate-600">
          Connect an enterprise identity provider through SAML.
        </p>
      </div>
    </div>

    {#if samlEnabled}
      <div class="space-y-4 bg-slate-50 px-4 py-4">
        <div>
          <label for="saml-entry" class="block text-sm font-medium text-slate-700">SAML Entry Point</label>
          <input
            id="saml-entry"
            type="text"
            bind:value={samlEntryPoint}
            class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="https://idp.example.com/sso"
          />
        </div>

        <div>
          <label for="saml-issuer" class="block text-sm font-medium text-slate-700">SAML Issuer</label>
          <input
            id="saml-issuer"
            type="text"
            bind:value={samlIssuer}
            class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="gitvault-suite"
          />
        </div>

        <div>
          <label for="saml-cert" class="block text-sm font-medium text-slate-700">SAML Certificate (PEM)</label>
          <textarea
            id="saml-cert"
            bind:value={samlCert}
            rows="4"
            class="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="-----BEGIN CERTIFICATE-----"
          ></textarea>
        </div>
      </div>
    {/if}
  </section>

  {#if configError}
    <div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {configError}
    </div>
  {/if}

  {#if saveSuccess}
    <div class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> Authentication settings saved.</span>
    </div>
  {/if}

  <button
    type="button"
    class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
    on:click={saveSettings}
    disabled={isSaving}
  >
    <RefreshCw class="h-4 w-4 {isSaving ? 'animate-spin' : ''}" />
    {isSaving ? 'Saving...' : 'Save authentication settings'}
  </button>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-2">
          <Users class="h-5 w-5 text-slate-900" />
          <h4 class="text-base font-semibold text-slate-900">Local users</h4>
        </div>

        <div class="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
          <div class="relative w-full lg:w-72">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search users or roles"
              class="field-input w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm outline-none transition"
            />
          </div>

          <button
            type="button"
            on:click={openCreateUserModal}
            class="btn-primary inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" />
            Create user
          </button>
        </div>
      </div>
    </div>

    <div class="space-y-4 p-4">
      {#if userError}
        <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {userError}
        </div>
      {/if}

      {#if userSuccess}
        <div class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {userSuccess}
        </div>
      {/if}

      {#if usersLoading}
        <div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          Loading users...
        </div>
      {:else if filteredUsers.length === 0}
        <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          No users found.
        </div>
      {:else}
        <div class="space-y-2">
          {#each filteredUsers as user}
            <div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p class="text-sm font-semibold text-slate-900">{user.username}</p>
                  <p class="mt-1 text-xs text-slate-500">{user.role} · created {user.created_at}</p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <select
                    value={user.role}
                    on:change={(event) => handleRoleChange(user.id, event)}
                    class="field-input rounded-md border bg-white px-2.5 py-2 text-xs font-medium outline-none transition"
                  >
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button
                    type="button"
                    class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                    on:click={() => openPasswordModal(user)}
                  >
                    <LockKeyhole class="h-3.5 w-3.5" />
                    Password
                  </button>

                  <button
                    type="button"
                    class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                    on:click={() => openDeleteModal(user)}
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

{#if createUserModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeCreateUserModal}
    aria-label="Close create user modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Create user modal">
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Create user</h5>
      </div>

      <div class="space-y-4 px-4 py-4">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-user-username">Username</label>
          <input
            id="new-user-username"
            type="text"
            bind:value={newUsername}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="john"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-user-password">Password</label>
          <input
            id="new-user-password"
            type="password"
            bind:value={newPassword}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-user-role">Role</label>
          <select
            id="new-user-role"
            bind:value={newRole}
            class="field-input mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition"
          >
            <option value="developer">Developer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={closeCreateUserModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={createUser}
          disabled={creatingUser}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Plus class="h-4 w-4" />
          {creatingUser ? 'Creating...' : 'Create user'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if passwordModalUser}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closePasswordModal}
    aria-label="Close password modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Change password modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Change password</h5>
        <p class="mt-1 text-xs text-slate-500">User: {passwordModalUser.username}</p>
      </div>

      <div class="space-y-4 px-4 py-4">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="change-password-input"
            >New password</label
          >
          <input
            id="change-password-input"
            type="password"
            bind:value={passwordModalValue}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="••••••••"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={closePasswordModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={submitChangePassword}
          disabled={passwordModalLoading}
          class="btn-primary rounded-md px-3 py-2 text-sm font-medium"
        >
          {passwordModalLoading ? 'Saving...' : 'Save password'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if deleteModalUser}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDeleteModal}
    aria-label="Close delete user confirmation"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Delete user confirmation"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Delete user</h5>
      </div>

      <div class="px-4 py-4">
        <p class="text-sm text-slate-700">
          Are you sure you want to delete <span class="font-semibold">{deleteModalUser.username}</span>?
          This action cannot be undone.
        </p>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={closeDeleteModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={confirmDeleteUser}
          disabled={deleteModalLoading}
          class="btn-danger rounded-md px-3 py-2 text-sm font-medium"
        >
          {deleteModalLoading ? 'Deleting...' : 'Delete user'}
        </button>
      </div>
    </div>
  </div>
{/if}