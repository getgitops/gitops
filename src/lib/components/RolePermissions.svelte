<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import { CheckCircle, Plus, Save, Shield, Trash2 } from 'lucide-svelte';
  import {
    PERMISSION_SECTIONS,
    PERMISSION_ACTIONS,
    PERMISSION_SECTION_LABELS,
    PERMISSION_ACTION_LABELS,
    hasPermission,
    isSectionFullyGranted,
    togglePermissionAction,
    toggleSectionAll,
    type PermissionSection,
    type PermissionAction,
  } from '$lib/permissions';

  export let scope: 'cluster' | 'organization' | 'project';
  export let scopeId = '';
  export let initialRoles: RoleRow[] = [];
  export let title = 'Roles & Permissions';
  export let description =
    'Manage user roles and granular access policies across Vault, Open Report and State IaC.';

  type RoleRow = {
    id: string;
    name: string;
    slug: string;
    permissions: string[];
    createdAt: string;
    updatedAt: string;
  };

  let roles: RoleRow[] = initialRoles;
  let rolesError = '';
  let rolesSuccess = '';
  let savingRoleId: string | null = null;
  let deleteModalRole: RoleRow | null = null;
  let deleteModalLoading = false;
  let createModalOpen = false;
  let creatingRole = false;
  let newRoleName = '';
  let newRoleSlug = '';
  let newRolePermissions: string[] = [];

  $: roles = initialRoles;

  async function submitAction(action: string, values: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);

    const response = await fetch(`?/${action}`, { method: 'POST', body: formData });
    const result = deserialize(await response.text());
    if (result.type === 'failure' || result.type === 'error') {
      const data = result.type === 'failure' ? result.data : null;
      throw new Error(typeof data?.error === 'string' ? data.error : 'Role action failed.');
    }
    await invalidateAll();
  }

  function flashSuccess(message: string) {
    rolesSuccess = message;
    setTimeout(() => {
      rolesSuccess = '';
    }, 2500);
  }

  function onToggleAction(role: RoleRow, section: PermissionSection, action: PermissionAction) {
    role.permissions = togglePermissionAction(role.permissions, section, action);
    roles = roles;
  }

  function onToggleAll(role: RoleRow, section: PermissionSection) {
    role.permissions = toggleSectionAll(role.permissions, section);
    roles = roles;
  }

  async function saveRole(role: RoleRow) {
    rolesError = '';
    rolesSuccess = '';
    savingRoleId = role.id;

    try {
      await submitAction('updateRole', {
        id: role.id,
        name: role.name,
        permissions: JSON.stringify(role.permissions),
      });
      flashSuccess(`Saved permissions for ${role.name}.`);
    } catch (error: unknown) {
      rolesError = error instanceof Error ? error.message : 'Failed to save role.';
    } finally {
      savingRoleId = null;
    }
  }

  function openCreateModal() {
    rolesError = '';
    newRoleName = '';
    newRoleSlug = '';
    newRolePermissions = [];
    createModalOpen = true;
  }

  function onToggleNewAction(section: PermissionSection, action: PermissionAction) {
    newRolePermissions = togglePermissionAction(newRolePermissions, section, action);
  }

  function onToggleNewAll(section: PermissionSection) {
    newRolePermissions = toggleSectionAll(newRolePermissions, section);
  }

  async function createRole() {
    rolesError = '';
    if (!newRoleName.trim() || !newRoleSlug.trim()) {
      rolesError = 'Name and slug are required.';
      return;
    }

    creatingRole = true;
    try {
      const values: Record<string, string> = {
        name: newRoleName.trim(),
        slug: newRoleSlug.trim(),
        permissions: JSON.stringify(newRolePermissions),
        scope,
      };

      if (scope === 'organization') values.organizationId = scopeId;
      if (scope === 'project') values.projectId = scopeId;

      await submitAction('createRole', {
        ...values,
      });
      createModalOpen = false;
      flashSuccess('Role created.');
    } catch (error: unknown) {
      rolesError = error instanceof Error ? error.message : 'Failed to create role.';
    } finally {
      creatingRole = false;
    }
  }

  function openDeleteModal(role: RoleRow) {
    deleteModalRole = role;
    rolesError = '';
  }

  async function confirmDeleteRole() {
    if (!deleteModalRole) return;

    rolesError = '';
    deleteModalLoading = true;
    try {
      await submitAction('deleteRole', { id: deleteModalRole.id });
      deleteModalRole = null;
      flashSuccess('Role deleted.');
    } catch (error: unknown) {
      rolesError = error instanceof Error ? error.message : 'Failed to delete role.';
    } finally {
      deleteModalLoading = false;
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
      on:click={openCreateModal}
      class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
    >
      <Plus class="h-4 w-4" />
      New role
    </button>
  </section>

  {#if rolesError}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {rolesError}
    </div>
  {/if}
  {#if rolesSuccess}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"
        ><CheckCircle class="h-4 w-4" /> {rolesSuccess}</span
      >
    </div>
  {/if}

  {#if roles.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      No roles found.
    </div>
  {:else}
    <div class="space-y-4">
      {#each roles as role (role.id)}
        <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div
            class="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="flex items-center gap-2">
              <Shield class="h-5 w-5 text-slate-900" />
              <input
                type="text"
                bind:value={role.name}
                class="field-input rounded-md border bg-white px-2 py-1 text-sm font-semibold outline-none transition"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                on:click={() => saveRole(role)}
                disabled={savingRoleId === role.id}
                class="btn-primary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
              >
                <Save class="h-3.5 w-3.5" />
                {savingRoleId === role.id ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                on:click={() => openDeleteModal(role)}
                class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
              >
                <Trash2 class="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
          <div class="overflow-x-auto p-4">
            <table class="w-full min-w-120 text-sm">
              <thead
                ><tr class="text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                  ><th class="pb-2 pr-4">Section</th>{#each PERMISSION_ACTIONS as action}<th
                      class="pb-2 pr-4">{PERMISSION_ACTION_LABELS[action]}</th
                    >{/each}<th class="pb-2">All</th></tr
                ></thead
              >
              <tbody>
                {#each PERMISSION_SECTIONS as section}
                  <tr class="border-t border-slate-100">
                    <td class="py-2 pr-4 font-medium text-slate-900"
                      >{PERMISSION_SECTION_LABELS[section]}</td
                    >
                    {#each PERMISSION_ACTIONS as action}
                      <td class="py-2 pr-4"
                        ><input
                          type="checkbox"
                          checked={hasPermission(role.permissions, `${section}:${action}`)}
                          disabled={isSectionFullyGranted(role.permissions, section)}
                          on:change={() => onToggleAction(role, section, action)}
                          class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        /></td
                      >
                    {/each}
                    <td class="py-2"
                      ><input
                        type="checkbox"
                        checked={isSectionFullyGranted(role.permissions, section)}
                        on:change={() => onToggleAll(role, section)}
                        class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      /></td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

{#if createModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={() => (createModalOpen = false)}
    aria-label="Close create role modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Create role modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">New role</h5>
      </div>
      <div class="space-y-4 px-4 py-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-role-name">Name</label
            ><input
              id="new-role-name"
              type="text"
              bind:value={newRoleName}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="Auditor"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-role-slug">Slug</label
            ><input
              id="new-role-slug"
              type="text"
              bind:value={newRoleSlug}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="auditor"
            />
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-110 text-sm">
            <thead
              ><tr class="text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                ><th class="pb-2 pr-4">Section</th>{#each PERMISSION_ACTIONS as action}<th
                    class="pb-2 pr-4">{PERMISSION_ACTION_LABELS[action]}</th
                  >{/each}<th class="pb-2">All</th></tr
              ></thead
            >
            <tbody>
              {#each PERMISSION_SECTIONS as section}
                <tr class="border-t border-slate-100">
                  <td class="py-2 pr-4 font-medium text-slate-900"
                    >{PERMISSION_SECTION_LABELS[section]}</td
                  >
                  {#each PERMISSION_ACTIONS as action}<td class="py-2 pr-4"
                      ><input
                        type="checkbox"
                        checked={hasPermission(newRolePermissions, `${section}:${action}`)}
                        disabled={isSectionFullyGranted(newRolePermissions, section)}
                        on:change={() => onToggleNewAction(section, action)}
                        class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      /></td
                    >{/each}
                  <td class="py-2"
                    ><input
                      type="checkbox"
                      checked={isSectionFullyGranted(newRolePermissions, section)}
                      on:change={() => onToggleNewAll(section)}
                      class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    /></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={() => (createModalOpen = false)}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium">Cancel</button
        ><button
          type="button"
          on:click={createRole}
          disabled={creatingRole}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          ><Plus class="h-4 w-4" />{creatingRole ? 'Creating...' : 'Create role'}</button
        >
      </div>
    </div>
  </div>
{/if}

{#if deleteModalRole}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={() => (deleteModalRole = null)}
    aria-label="Close delete role confirmation"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Delete role confirmation"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Delete role</h5>
      </div>
      <div class="px-4 py-4">
        <p class="text-sm text-slate-700">
          Are you sure you want to delete <span class="font-semibold">{deleteModalRole.name}</span>?
          Roles assigned to existing users cannot be deleted.
        </p>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={() => (deleteModalRole = null)}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium">Cancel</button
        ><button
          type="button"
          on:click={confirmDeleteRole}
          disabled={deleteModalLoading}
          class="btn-danger rounded-md px-3 py-2 text-sm font-medium"
          >{deleteModalLoading ? 'Deleting...' : 'Delete role'}</button
        >
      </div>
    </div>
  </div>
{/if}
