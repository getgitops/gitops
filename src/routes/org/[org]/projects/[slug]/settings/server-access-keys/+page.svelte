<script lang="ts">
  import {
    Check,
    CircleAlert,
    Clock,
    Copy,
    KeyRound,
    Plus,
    RefreshCw,
    ShieldCheck,
    Terminal,
    Trash2,
    UserRound,
    X,
  } from '@lucide/svelte';
  import { _, locale } from '#lib/i18n';
  import { relativeTime } from '#lib/format/relative-time';

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

  type Props = {
    data: {
      apiKeys: ApiKeyRow[];
      roles: RoleRow[];
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    };
    form: { success?: boolean; error?: string; createdKey?: string } | null;
  };

  let { data, form }: Props = $props();

  /** Keys that expire within this many days get a warning */
  const EXPIRING_SOON_DAYS = 14;
  const DAY = 24 * 60 * 60 * 1000;

  let createOpen = $state(false);
  let name = $state('');
  let expiresInDays = $state('');
  let roleId = $state('');
  let copied = $state(false);

  // the page reloads after creating: the new token arrives in `form`, the modal is no longer needed
  $effect(() => {
    if (form?.success && form?.createdKey) createOpen = false;
  });

  type KeyState = 'active' | 'expiring' | 'expired' | 'revoked';

  function stateOf(key: ApiKeyRow): KeyState {
    if (key.revokedAt) return 'revoked';
    if (key.expiresAt) {
      const left = new Date(key.expiresAt).getTime() - Date.now();
      if (left <= 0) return 'expired';
      if (left <= EXPIRING_SOON_DAYS * DAY) return 'expiring';
    }
    return 'active';
  }

  const ORDER: Record<KeyState, number> = { expiring: 0, active: 1, expired: 2, revoked: 3 };
  const keys = $derived(
    [...data.apiKeys].sort(
      (a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || b.createdAt.localeCompare(a.createdAt),
    ),
  );
  const usable = $derived(
    keys.filter((key) => ['active', 'expiring'].includes(stateOf(key))).length,
  );
  const roleNameById = $derived(new Map(data.roles.map((role) => [role.id, role.name])));

  const STATE_LABEL: Record<KeyState, string> = $derived({
    active: $_('projectSettings.serverAccessKeys.active'),
    expiring: $_('projectSettings.serverAccessKeys.expiringSoon'),
    expired: $_('projectSettings.serverAccessKeys.expired'),
    revoked: $_('projectSettings.serverAccessKeys.revoked'),
  });

  function formatDate(value: string | null) {
    if (!value) return $_('projectSettings.serverAccessKeys.never');
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(
      new Date(value),
    );
  }

  function ago(value: string | null) {
    return value ? relativeTime(value, $locale) : $_('projectSettings.serverAccessKeys.never');
  }

  function openCreate() {
    name = '';
    expiresInDays = '';
    roleId = data.roles[0]?.id ?? '';
    createOpen = true;
  }

  async function copyToken() {
    if (!form?.createdKey) return;
    await navigator.clipboard.writeText(form.createdKey);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const ENDPOINT = 'POST /api/code-report/scan';
</script>

<svelte:head>
  <title>{$_('projectSettings.serverAccessKeys.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<div class="keys-page">
  <header class="head">
    <div>
      <h2>{$_('projectSettings.serverAccessKeys.title')}</h2>
      <p>
        {$_('projectSettings.serverAccessKeys.descriptionPrefix')}
        <code>{ENDPOINT}</code>.
      </p>
    </div>
    <div class="head-actions">
      {#if data.apiKeys.length}
        <span class="summary">
          <ShieldCheck class="h-3.5 w-3.5" />
          {$_('projectSettings.serverAccessKeys.summary', {
            values: { usable, total: data.apiKeys.length },
          })}
        </span>
      {/if}
      {#if data.canCreate}
        <button type="button" class="primary" onclick={openCreate}>
          <Plus class="h-4 w-4" />
          {$_('projectSettings.serverAccessKeys.createKey')}
        </button>
      {/if}
    </div>
  </header>

  {#if form?.error}
    <p class="banner banner-error" role="alert"><CircleAlert class="h-4 w-4" />{form.error}</p>
  {/if}

  {#if form?.createdKey}
    <div class="token" role="status">
      <div class="token-text">
        <strong>{$_('projectSettings.serverAccessKeys.copyTokenNow')}</strong>
        <code>{form.createdKey}</code>
      </div>
      <button type="button" class="ghost" onclick={copyToken}>
        {#if copied}<Check class="h-4 w-4" />{$_(
            'projectSettings.serverAccessKeys.copied',
          )}{:else}<Copy class="h-4 w-4" />{$_('projectSettings.serverAccessKeys.copyToken')}{/if}
      </button>
    </div>
  {/if}

  {#if keys.length === 0}
    <div class="empty">
      <span class="empty-icon"><KeyRound class="h-7 w-7" /></span>
      <strong class="empty-title">{$_('projectSettings.serverAccessKeys.noKeys')}</strong>
      <p>{$_('projectSettings.serverAccessKeys.emptyHint')}</p>
      {#if data.canCreate}
        <button type="button" class="primary" onclick={openCreate}>
          <Plus class="h-4 w-4" />
          {$_('projectSettings.serverAccessKeys.createKey')}
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid">
      {#each keys as key (key.id)}
        {@const state = stateOf(key)}
        <article class="key state-{state}">
          <div class="key-top">
            <span class="key-icon"><KeyRound class="h-[18px] w-[18px]" /></span>
            <span class="pill pill-{state}"><span class="dot"></span>{STATE_LABEL[state]}</span>
          </div>

          <strong class="key-name">{key.name}</strong>
          <code class="prefix">{key.keyPrefix}••••••••</code>

          <dl class="meta">
            <div>
              <dt>
                <UserRound class="h-3.5 w-3.5" />{$_('projectSettings.serverAccessKeys.role')}
              </dt>
              <dd>{(key.roleId && roleNameById.get(key.roleId)) ?? '—'}</dd>
            </div>
            <div>
              <dt>
                <Clock class="h-3.5 w-3.5" />{$_('projectSettings.serverAccessKeys.lastUsed')}
              </dt>
              <dd>{ago(key.lastUsedAt)}</dd>
            </div>
            <div>
              <dt>{$_('projectSettings.serverAccessKeys.created')}</dt>
              <dd>{formatDate(key.createdAt)}</dd>
            </div>
            <div>
              <dt>{$_('projectSettings.serverAccessKeys.expires')}</dt>
              <dd class:warn={state === 'expiring'} class:bad={state === 'expired'}>
                {key.expiresAt
                  ? `${formatDate(key.expiresAt)} · ${ago(key.expiresAt)}`
                  : formatDate(null)}
              </dd>
            </div>
            {#if key.revokedAt}
              <div>
                <dt>{$_('projectSettings.serverAccessKeys.revoked')}</dt>
                <dd class="bad">{formatDate(key.revokedAt)}</dd>
              </div>
            {/if}
          </dl>

          {#if !key.revokedAt && (data.canUpdate || data.canDelete)}
            <footer class="key-actions">
              {#if data.canUpdate}
                <form method="POST" action="?/rotate">
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    class="ghost"
                    title={$_('projectSettings.serverAccessKeys.rotateHint')}
                    onclick={(event) => {
                      if (
                        !confirm(
                          $_('projectSettings.serverAccessKeys.confirmRotate', {
                            values: { name: key.name },
                          }),
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    <RefreshCw class="h-3.5 w-3.5" />
                    {$_('projectSettings.serverAccessKeys.rotate')}
                  </button>
                </form>
              {/if}
              {#if data.canDelete}
                <form method="POST" action="?/revoke">
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    class="danger"
                    onclick={(event) => {
                      if (
                        !confirm(
                          $_('projectSettings.serverAccessKeys.confirmRevoke', {
                            values: { name: key.name },
                          }),
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    {$_('projectSettings.serverAccessKeys.revoke')}
                  </button>
                </form>
              {/if}
            </footer>
          {/if}
        </article>
      {/each}
    </div>
  {/if}

  <!-- How to use a key from CI -->
  <section class="usage">
    <span class="key-icon"><Terminal class="h-[18px] w-[18px]" /></span>
    <div class="usage-body">
      <strong>{$_('projectSettings.serverAccessKeys.usageTitle')}</strong>
      <p>{$_('projectSettings.serverAccessKeys.usageDescription')}</p>
      <pre><code
          >curl -X POST "$GITOPS_URL/api/code-report/scan" \
  -H "Authorization: Bearer $GITOPS_KEY" \
  -H "Content-Type: application/json" \
  -d '&#123;"status": "in_progress", "service": "api", "project": "…", "tool": "trivy"&#125;'</code
        ></pre>
    </div>
  </section>
</div>

{#if createOpen}
  <div class="modal-layer">
    <button
      type="button"
      class="backdrop"
      aria-label={$_('projectSettings.serverAccessKeys.cancel')}
      onclick={() => (createOpen = false)}
    ></button>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="create-key-title">
      <button
        type="button"
        class="modal-close"
        aria-label={$_('projectSettings.serverAccessKeys.cancel')}
        onclick={() => (createOpen = false)}
      >
        <X class="h-4 w-4" />
      </button>
      <h2 id="create-key-title">
        {$_('projectSettings.serverAccessKeys.createServerAccessKeyShort')}
      </h2>

      <form method="POST" action="?/create" class="modal-form">
        <label for="key-name">{$_('common.name')}</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="key-name"
          name="name"
          type="text"
          required
          bind:value={name}
          placeholder="CI pipeline"
          class="control"
          autofocus
        />

        <label for="key-role">{$_('projectSettings.serverAccessKeys.role')}</label>
        <select id="key-role" name="roleId" required bind:value={roleId} class="control select">
          {#each data.roles as role (role.id)}
            <option value={role.id}>{role.name}</option>
          {/each}
        </select>
        <p class="hint">{$_('projectSettings.serverAccessKeys.roleHint')}</p>

        <span class="label" id="key-expiration-label"
          >{$_('projectSettings.serverAccessKeys.expiration')}</span
        >
        <div class="segmented" role="radiogroup" aria-labelledby="key-expiration-label">
          {#each [['', $_('projectSettings.serverAccessKeys.never')], ['7', $_('projectSettings.serverAccessKeys.days7')], ['30', $_('projectSettings.serverAccessKeys.days30')], ['90', $_('projectSettings.serverAccessKeys.days90')], ['365', $_('projectSettings.serverAccessKeys.days365')]] as [value, label] (value)}
            <label class:active={expiresInDays === value}>
              <input type="radio" name="expiresInDays" {value} bind:group={expiresInDays} />
              {label}
            </label>
          {/each}
        </div>

        <div class="modal-actions">
          <button type="button" class="ghost" onclick={() => (createOpen = false)}>
            {$_('projectSettings.serverAccessKeys.cancel')}
          </button>
          <button type="submit" class="primary" disabled={!name.trim() || !roleId}>
            {$_('projectSettings.serverAccessKeys.createKey')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .keys-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }

  .head h2 {
    color: #ece8ee;
    font-size: 17px;
    font-weight: 560;
  }

  .head p {
    max-width: 680px;
    margin-top: 4px;
    color: #8a858d;
    font-size: 13.5px;
    line-height: 1.5;
  }

  .head code {
    padding: 1px 6px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 5px;
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .head-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }

  @media (max-width: 760px) {
    .head {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .summary {
    display: inline-flex;
    height: 28px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.03);
    color: #b9b4bc;
    font-size: 12.5px;
  }

  /* Buttons */
  .primary,
  .ghost,
  .danger {
    display: inline-flex;
    height: 34px;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 540;
    white-space: nowrap;
    transition: all 120ms ease;
  }

  .primary {
    border: 1px solid #f95d11;
    background: linear-gradient(180deg, #ff7430, #e74d08);
    box-shadow: 0 6px 18px rgb(249 93 17 / 0.18);
    color: #fff;
  }

  .primary:disabled {
    opacity: 0.5;
  }

  .ghost {
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
  }

  .ghost:hover {
    background: rgb(255 255 255 / 0.08);
  }

  .danger {
    border: 1px solid rgb(248 113 113 / 0.3);
    background: rgb(248 113 113 / 0.06);
    color: #fca5a5;
  }

  .danger:hover {
    background: rgb(248 113 113 / 0.14);
  }

  /* Banners */
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid;
    border-radius: 10px;
    font-size: 13px;
  }

  .banner-error {
    border-color: rgb(248 113 113 / 0.25);
    background: rgb(248 113 113 / 0.07);
    color: #fca5a5;
  }

  .token {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid rgb(249 93 17 / 0.35);
    border-radius: 12px;
    background: rgb(249 93 17 / 0.06);
  }

  .token-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
  }

  .token-text strong {
    color: #ffb38a;
    font-size: 13px;
    font-weight: 560;
  }

  .token-text code {
    padding: 8px 10px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 8px;
    background: rgb(0 0 0 / 0.35);
    color: #ece8ee;
    font-family: var(--font-mono);
    font-size: 12.5px;
    word-break: break-all;
  }

  /* Cards */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .key {
    display: flex;
    flex-direction: column;
    padding: 16px 16px 0;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.015));
    transition: border-color 120ms ease;
  }

  .key:hover {
    border-color: rgb(255 255 255 / 0.12);
  }

  .key.state-expiring {
    border-color: rgb(251 191 36 / 0.28);
  }

  .key.state-expired,
  .key.state-revoked {
    opacity: 0.6;
  }

  .key.state-revoked {
    padding-bottom: 16px;
  }

  .key-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .key-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(249 93 17 / 0.25);
    border-radius: 9px;
    background: rgb(249 93 17 / 0.1);
    color: #ff8a4c;
  }

  .state-expired .key-icon,
  .state-revoked .key-icon {
    border-color: rgb(255 255 255 / 0.08);
    background: rgb(255 255 255 / 0.04);
    color: #8a858d;
  }

  .key-name {
    overflow: hidden;
    color: #ece8ee;
    font-size: 14.5px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prefix {
    align-self: flex-start;
    margin-top: 6px;
    padding: 2px 7px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 6px;
    background: rgb(255 255 255 / 0.03);
    color: #a9a4ac;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .meta dt {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #6d6870;
    font-size: 11.5px;
  }

  .meta dd {
    margin-top: 2px;
    overflow: hidden;
    color: #ded9df;
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta dd.warn {
    color: #f6c860;
  }

  .meta dd.bad {
    color: #fca5a5;
  }

  .key-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 14px -16px 0;
    padding: 10px 16px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .key-actions .ghost,
  .key-actions .danger {
    height: 30px;
    font-size: 12.5px;
  }

  /* Pills */
  .pill {
    display: inline-flex;
    height: 22px;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 520;
  }

  .pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .pill-active {
    border-color: rgb(74 222 128 / 0.2);
    background: rgb(74 222 128 / 0.08);
    color: #6ee7a0;
  }

  .pill-expiring {
    border-color: rgb(251 191 36 / 0.22);
    background: rgb(251 191 36 / 0.08);
    color: #f6c860;
  }

  .pill-expired,
  .pill-revoked {
    border-color: rgb(248 113 113 / 0.22);
    background: rgb(248 113 113 / 0.07);
    color: #fca5a5;
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 24px;
    border: 1px dashed rgb(255 255 255 / 0.11);
    border-radius: 14px;
    background:
      radial-gradient(45% 55% at 50% 0%, rgb(249 93 17 / 0.08), transparent 75%),
      rgb(255 255 255 / 0.018);
    text-align: center;
  }

  .empty-icon {
    display: grid;
    width: 56px;
    height: 56px;
    place-items: center;
    margin-bottom: 6px;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 15px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .empty-title {
    color: #ece8ee;
    font-size: 15px;
    font-weight: 560;
  }

  .empty p {
    max-width: 460px;
    margin-bottom: 8px;
    color: #8a858d;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Usage */
  .usage {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.015);
  }

  .usage-body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  }

  .usage-body strong {
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
  }

  .usage-body p {
    color: #8a858d;
    font-size: 12.5px;
  }

  .usage pre {
    margin-top: 8px;
    overflow-x: auto;
    padding: 12px 14px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 8px;
    background: rgb(0 0 0 / 0.35);
    color: #d8d3da;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
  }

  /* Modal */
  .modal-layer {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgb(5 5 7 / 0.72);
    backdrop-filter: blur(6px);
  }

  .modal {
    position: relative;
    width: min(460px, 100%);
    padding: 22px;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 14px;
    background: #17181d;
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
  }

  .modal h2 {
    color: #ece8ee;
    font-size: 16px;
    font-weight: 600;
  }

  .modal-close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 7px;
    color: #77737a;
  }

  .modal-close:hover {
    background: rgb(255 255 255 / 0.06);
    color: #ece8ee;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    margin-top: 14px;
  }

  .modal-form > label,
  .modal-form > .label {
    margin: 12px 0 6px;
    color: #ded9df;
    font-size: 13px;
    font-weight: 540;
  }

  /* app.css paints every input/select navy with !important: these win on specificity */
  .modal .control {
    height: 38px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 0.09) !important;
    border-radius: 8px;
    background-color: rgb(255 255 255 / 0.025) !important;
    color: #ece8ee !important;
    font-size: 13.5px;
    outline: none;
  }

  .modal .control:focus {
    border-color: rgb(249 93 17 / 0.42) !important;
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .modal .select {
    padding-right: 30px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a858d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right 10px center;
    background-repeat: no-repeat;
  }

  .modal .select option {
    background: #1b1b1f;
  }

  .hint {
    margin-top: 6px;
    color: #6d6870;
    font-size: 12px;
  }

  .segmented {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.02);
  }

  .segmented label {
    position: relative;
    display: inline-flex;
    height: 28px;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border-radius: 6px;
    color: #9d98a0;
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .segmented label.active {
    background: rgb(255 255 255 / 0.09);
    color: #ece8ee;
  }

  .segmented input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .segmented label:has(input:focus-visible) {
    outline: 2px solid rgb(249 93 17 / 0.5);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
</style>
