<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    Check,
    Copy,
    KeyRound,
    LoaderCircle,
    Plus,
    RefreshCw,
    ShieldAlert,
    Trash2,
  } from '@lucide/svelte';
  import { Field, Modal, Select, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

  type ApiKeyRow = {
    id: string;
    name: string;
    keyPrefix: string;
    roleId: string | null;
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  };
  type RoleRow = { id: string; name: string; slug: string };

  let {
    data,
    form,
  }: {
    data: {
      apiKeys: ApiKeyRow[];
      roles: RoleRow[];
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    };
    form: { success?: boolean; error?: string; createdKey?: string } | null;
  } = $props();

  const ENDPOINT = 'POST /api/code-report/analyse-result';
  const roleNameById = $derived(new Map(data.roles.map((role) => [role.id, role.name])));

  type KeyState = 'active' | 'expired' | 'revoked';
  function stateOf(key: ApiKeyRow): KeyState {
    if (key.revokedAt) return 'revoked';
    if (key.expiresAt && new Date(key.expiresAt) <= new Date()) return 'expired';
    return 'active';
  }
  // activas primero; dentro de cada estado, las más recientes arriba
  const keys = $derived(
    [...data.apiKeys].sort(
      (a, b) =>
        Number(stateOf(a) !== 'active') - Number(stateOf(b) !== 'active') ||
        b.createdAt.localeCompare(a.createdAt),
    ),
  );

  function formatDate(
    value: string | null,
    fallback = $_('projectSettings.serverAccessKeys.never'),
  ) {
    if (!value) return fallback;
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(
      new Date(value),
    );
  }

  // creación
  let createOpen = $state(false);
  let creating = $state(false);
  let name = $state('');
  let roleId = $state('');
  let expiresInDays = $state('90');

  // token recién creado o rotado (sin JavaScript llega en `form`)
  let token = $state<string | null>(untrack(() => form?.createdKey ?? null));
  let tokenOpen = $state(untrack(() => Boolean(form?.createdKey)));
  let copied = $state(false);

  // confirmaciones por fila
  let target = $state<ApiKeyRow | null>(null);
  let rotateOpen = $state(false);
  let revokeOpen = $state(false);
  let busy = $state(false);

  function openCreate() {
    name = '';
    roleId = data.roles[0]?.id ?? '';
    expiresInDays = '90';
    createOpen = true;
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function showToken(value: unknown) {
    if (typeof value !== 'string') return;
    token = value;
    copied = false;
    tokenOpen = true;
  }

  const submitCreate: SubmitFunction = () => {
    creating = true;
    return async ({ result, update }) => {
      creating = false;
      if (result.type === 'success') {
        createOpen = false;
        showToken(result.data?.createdKey);
        await update({ invalidateAll: true, reset: true });
      } else if (result.type === 'failure') {
        toast.error(String(result.data?.error ?? $_('projectSettings.serverAccessKeys.failed')));
      } else {
        await update();
      }
    };
  };

  const submitRowAction =
    (kind: 'rotate' | 'revoke'): SubmitFunction =>
    () => {
      busy = true;
      return async ({ result, update }) => {
        busy = false;
        rotateOpen = false;
        revokeOpen = false;
        if (result.type === 'success') {
          if (kind === 'rotate') showToken(result.data?.createdKey);
          else toast.success($_('projectSettings.serverAccessKeys.revokedToast'), target?.name);
          await update();
        } else if (result.type === 'failure') {
          toast.error(String(result.data?.error ?? $_('projectSettings.serverAccessKeys.failed')));
        } else {
          await update();
        }
      };
    };
</script>

<svelte:head>
  <title>{$_('projectSettings.serverAccessKeys.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('projectSettings.serverAccessKeys.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">
        {$_('projectSettings.serverAccessKeys.descriptionPrefix')}
        <code class="rounded bg-white/6 px-1.5 py-0.5 font-mono text-xs text-fg">{ENDPOINT}</code>.
      </p>
    </div>
    {#if data.canCreate}
      <button type="button" class="k-btn k-btn-primary" onclick={openCreate}>
        <Plus class="h-4 w-4" />{$_('projectSettings.serverAccessKeys.createKey')}
      </button>
    {/if}
  </header>

  {#if form?.error}
    <p
      class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      {form.error}
    </p>
  {/if}

  <div class="k-card overflow-hidden">
    {#if keys.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
          <KeyRound class="h-6 w-6" />
        </span>
        <p class="text-sm font-medium text-white">
          {$_('projectSettings.serverAccessKeys.noKeys')}
        </p>
        <p class="max-w-sm text-sm text-fg-muted">
          {$_('projectSettings.serverAccessKeys.emptyHelp')}
        </p>
        {#if data.canCreate}
          <button type="button" class="k-btn k-btn-secondary k-btn-sm mt-1" onclick={openCreate}>
            <Plus class="h-3.5 w-3.5" />{$_('projectSettings.serverAccessKeys.createKey')}
          </button>
        {/if}
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-176 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">{$_('common.name')}</th>
              <th class="px-3 py-3 font-semibold">{$_('projectSettings.serverAccessKeys.role')}</th>
              <th class="px-3 py-3 font-semibold">
                {$_('projectSettings.serverAccessKeys.lastUsed')}
              </th>
              <th class="px-3 py-3 font-semibold"
                >{$_('projectSettings.serverAccessKeys.expires')}</th
              >
              <th class="px-3 py-3 font-semibold">{$_('projectSettings.serverAccessKeys.state')}</th
              >
              <th class="px-5 py-3"><span class="sr-only">{$_('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each keys as key (key.id)}
              {@const keyState = stateOf(key)}
              <tr
                class="transition-colors hover:bg-white/2.5 {keyState === 'active'
                  ? ''
                  : 'opacity-60'}"
              >
                <td class="px-5 py-3">
                  <p class="font-medium text-white">{key.name}</p>
                  <p class="mt-0.5 font-mono text-xs text-fg-subtle">
                    {key.keyPrefix}… · {$_('projectSettings.serverAccessKeys.created')}
                    {formatDate(key.createdAt)}
                  </p>
                </td>
                <td class="px-3 py-3">
                  <span class="k-badge">{(key.roleId && roleNameById.get(key.roleId)) ?? '—'}</span>
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-muted"
                  >{formatDate(key.lastUsedAt)}</td
                >
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-muted"
                  >{formatDate(key.expiresAt)}</td
                >
                <td class="px-3 py-3">
                  <span
                    class="k-badge {keyState === 'active'
                      ? 'k-badge-ok'
                      : keyState === 'expired'
                        ? 'k-badge-warn'
                        : 'k-badge-danger'}"
                  >
                    {$_(`projectSettings.serverAccessKeys.${keyState}`)}
                  </span>
                </td>
                <td class="px-5 py-3">
                  {#if !key.revokedAt && (data.canUpdate || data.canDelete)}
                    <div class="flex items-center justify-end gap-1">
                      {#if data.canUpdate}
                        <form
                          id="rotate-{key.id}"
                          method="POST"
                          action="?/rotate"
                          use:enhance={submitRowAction('rotate')}
                        >
                          <input type="hidden" name="keyId" value={key.id} />
                        </form>
                        <button
                          type="button"
                          class="k-btn k-btn-ghost k-btn-sm"
                          onclick={() => {
                            target = key;
                            rotateOpen = true;
                          }}
                        >
                          <RefreshCw class="h-3.5 w-3.5" />{$_(
                            'projectSettings.serverAccessKeys.rotate',
                          )}
                        </button>
                      {/if}
                      {#if data.canDelete}
                        <form
                          id="revoke-{key.id}"
                          method="POST"
                          action="?/revoke"
                          use:enhance={submitRowAction('revoke')}
                        >
                          <input type="hidden" name="keyId" value={key.id} />
                        </form>
                        <button
                          type="button"
                          class="k-btn k-btn-ghost k-btn-sm hover:text-red-400"
                          onclick={() => {
                            target = key;
                            revokeOpen = true;
                          }}
                        >
                          <Trash2 class="h-3.5 w-3.5" />{$_(
                            'projectSettings.serverAccessKeys.revoke',
                          )}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Crear -->
<Modal
  bind:open={createOpen}
  dismissible={!creating}
  title={$_('projectSettings.serverAccessKeys.createServerAccessKeyShort')}
  description={$_('projectSettings.serverAccessKeys.createDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><KeyRound class="h-5 w-5" /></span
    >
  {/snippet}
  <form
    id="create-key-form"
    method="POST"
    action="?/create"
    class="space-y-5"
    use:enhance={submitCreate}
  >
    <Field id="key-name" label={$_('common.name')} required>
      {#snippet children(control)}
        <input
          {...control}
          name="name"
          class="k-input"
          placeholder="CI pipeline"
          data-autofocus
          bind:value={name}
        />
      {/snippet}
    </Field>
    <Field
      id="key-role"
      label={$_('projectSettings.serverAccessKeys.role')}
      help={$_('projectSettings.serverAccessKeys.roleHint')}
      required
    >
      {#snippet children(control)}
        <Select
          id={control.id}
          aria-describedby={control['aria-describedby']}
          name="roleId"
          options={data.roles.map((role) => ({ value: role.id, label: role.name }))}
          bind:value={roleId}
        />
      {/snippet}
    </Field>
    <fieldset>
      <legend class="k-label">{$_('projectSettings.serverAccessKeys.expiration')}</legend>
      <div class="grid grid-cols-5 gap-1.5">
        {#each [['7', 'days7'], ['30', 'days30'], ['90', 'days90'], ['365', 'days365'], ['', 'never']] as [value, label] (value)}
          <label
            class="cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors has-checked:border-brand-500/50 has-checked:bg-brand-500/10 has-checked:text-brand-100 {expiresInDays ===
            value
              ? ''
              : 'border-white/10 text-fg-muted hover:border-white/20'}"
          >
            <input
              type="radio"
              name="expiresInDays"
              {value}
              class="sr-only"
              bind:group={expiresInDays}
            />
            {$_(`projectSettings.serverAccessKeys.${label}`)}
          </label>
        {/each}
      </div>
      {#if expiresInDays === ''}
        <p class="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
          <ShieldAlert class="h-3.5 w-3.5" />{$_('projectSettings.serverAccessKeys.neverWarning')}
        </p>
      {/if}
    </fieldset>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="create-key-form" class="k-btn k-btn-primary" disabled={creating || !name.trim()}>
      {#if creating}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
          class="h-4 w-4"
        />{/if}
      {$_('projectSettings.serverAccessKeys.createKey')}
    </button>
  {/snippet}
</Modal>

<!-- Token recién generado -->
<Modal
  bind:open={tokenOpen}
  title={$_('projectSettings.serverAccessKeys.tokenTitle')}
  description={$_('projectSettings.serverAccessKeys.copyTokenNow')}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok/10 text-ok"
      ><Check class="h-5 w-5" /></span
    >
  {/snippet}
  <div class="space-y-4">
    <div class="flex gap-2">
      <input
        class="k-input font-mono text-xs"
        readonly
        value={token ?? ''}
        aria-label={$_('projectSettings.serverAccessKeys.token')}
        onfocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        class="k-btn k-btn-secondary shrink-0"
        data-autofocus
        onclick={copyToken}
      >
        {#if copied}<Check class="h-4 w-4 text-ok" />{$_(
            'projectSettings.serverAccessKeys.copied',
          )}{:else}<Copy class="h-4 w-4" />{$_('projectSettings.serverAccessKeys.copyToken')}{/if}
      </button>
    </div>
    <div>
      <p class="k-label">{$_('projectSettings.serverAccessKeys.usage')}</p>
      <pre
        class="overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-fg">curl -X POST "$GITOPS_URL/api/code-report/analyse-result" \
  -H "Authorization: Bearer $GITOPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @report.json</pre>
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-primary" onclick={() => (tokenOpen = false)}
      >{$_('projectSettings.serverAccessKeys.done')}</button
    >
  {/snippet}
</Modal>

<!-- Rotar -->
<Modal
  bind:open={rotateOpen}
  size="sm"
  dismissible={!busy}
  title={$_('projectSettings.serverAccessKeys.rotateTitle')}
  description={$_('projectSettings.serverAccessKeys.rotateDescription', {
    values: { name: target?.name ?? '' },
  })}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/10 text-warn"
      ><RefreshCw class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (rotateOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="rotate-{target?.id}" class="k-btn k-btn-primary" disabled={busy} data-autofocus>
      {#if busy}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {$_('projectSettings.serverAccessKeys.rotateConfirm')}
    </button>
  {/snippet}
</Modal>

<!-- Revocar -->
<Modal
  bind:open={revokeOpen}
  role="alertdialog"
  size="sm"
  dismissible={!busy}
  title={$_('projectSettings.serverAccessKeys.revokeTitle')}
  description={$_('projectSettings.serverAccessKeys.revokeDescription', {
    values: { name: target?.name ?? '' },
  })}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (revokeOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="revoke-{target?.id}" class="k-btn k-btn-danger" disabled={busy} data-autofocus>
      {#if busy}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {$_('projectSettings.serverAccessKeys.revokeConfirm')}
    </button>
  {/snippet}
</Modal>
