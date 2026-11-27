<!--
  Integraciones de la organización con proveedores de chat (la app de Slack de GitOps y, más
  adelante, Google Chat): una tarjeta por proveedor con su estado. Una integración sin configurar
  en esta instalación (variables SLACK_*) sale desactivada; los workspaces ya conectados se siguen
  listando y se pueden desconectar.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Check, CircleSlash, LoaderCircle, Plug, Plus, Power } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _, locale as uiLocale } from '#lib/i18n';
  import type { AppCardData, AppStatus } from '#lib/notifications/types';
  import { APP_INSTALL_ACTIONS, APP_REMOVE_ACTIONS, errorMessage, typeIcon } from './channel-ui';

  type Props = { apps: AppCardData[]; action: string };
  let { apps, action }: Props = $props();

  let busy = $state<string | null>(null);

  const STATUS_BADGES: Record<AppStatus, { key: string; tone: string }> = {
    installed: { key: 'notifications.apps.installed', tone: 'k-badge-ok' },
    available: { key: 'notifications.apps.notInstalled', tone: '' },
    disabled: { key: 'notifications.apps.disabled', tone: '' },
    coming_soon: { key: 'notifications.channels.comingSoon', tone: '' },
  };

  const failed = (data: Record<string, unknown> | undefined) =>
    errorMessage($_, data?.channelError ? String(data.channelError) : undefined);

  /** "Install": the action answers with the provider's URL (Slack's OAuth page). */
  const installApp: SubmitFunction = () => {
    busy = 'install';
    return async ({ result }) => {
      if (result.type === 'redirect') {
        // an external page: leave the app (busy stays on while the browser navigates)
        window.location.assign(result.location);
        return;
      }
      busy = null;
      toast.error(result.type === 'failure' ? failed(result.data) : $_('alerts.wizard.failed'));
    };
  };

  let removeTarget = $state<{ id: string; name: string; provider: AppCardData['provider'] } | null>(
    null,
  );
  let removeOpen = $state(false);

  function openRemove(
    event: MouseEvent,
    provider: AppCardData['provider'],
    installation: { id: string; name: string },
  ) {
    event.preventDefault();
    removeTarget = { ...installation, provider };
    removeOpen = true;
  }

  const remove: SubmitFunction = () => {
    busy = 'remove';
    return async ({ result }) => {
      busy = null;
      if (result.type === 'success') {
        removeOpen = false;
        toast.success($_('notifications.channels.slackAppRemovedToast'));
        await invalidateAll();
      } else {
        toast.error(result.type === 'failure' ? failed(result.data) : $_('alerts.wizard.failed'));
      }
    };
  };

  const removeAction = $derived(removeTarget ? APP_REMOVE_ACTIONS[removeTarget.provider] : null);
</script>

<section class="space-y-3" aria-labelledby="integrations-title" data-testid="apps">
  <div>
    <h2 id="integrations-title" class="flex items-center gap-2 text-sm font-semibold text-white">
      <Plug class="h-4 w-4" />{$_('notifications.apps.title')}
    </h2>
    <p class="mt-0.5 text-xs text-fg-subtle">{$_('notifications.apps.description')}</p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    {#each apps as app (app.provider)}
      {@const Icon = typeIcon(app.provider)}
      {@const badge = STATUS_BADGES[app.status]}
      {@const installAction = APP_INSTALL_ACTIONS[app.provider]}
      {@const removeFormAction = APP_REMOVE_ACTIONS[app.provider]}
      {@const off = app.status === 'disabled' || app.status === 'coming_soon'}
      <div
        class="k-card flex flex-col gap-3 p-4 {app.status === 'installed'
          ? 'border-brand-500/40'
          : ''}"
        data-app={app.provider}
        data-status={app.status}
        data-testid="app-card"
      >
        <div class="flex items-start gap-3">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-lg {app.status === 'installed'
              ? 'bg-brand-500/15 text-brand-400'
              : 'bg-white/5 text-fg-subtle'} {off ? 'opacity-60' : ''}"
            ><Icon class="h-4 w-4" /></span
          >
          <div class="min-w-0 flex-1 {off ? 'opacity-70' : ''}">
            <p class="text-sm font-medium text-white">
              {$_(`notifications.channels.types.${app.provider}`)}
            </p>
            <p class="mt-0.5 text-xs text-fg-subtle">
              {$_(`notifications.apps.descriptions.${app.provider}`)}
            </p>
          </div>
          <span
            class="k-badge {badge.tone} h-5 shrink-0 gap-1 px-1.5 text-[10px]"
            data-testid="app-status"
          >
            {#if app.status === 'disabled'}<CircleSlash class="h-3 w-3" />{/if}
            {$_(badge.key)}
          </span>
        </div>

        {#if app.installations.length > 0}
          <ul class="space-y-1.5">
            {#each app.installations as installation (installation.id)}
              <li
                class="flex items-center gap-2 text-xs text-fg-muted"
                data-testid="app-installation"
              >
                {#if app.status === 'disabled'}
                  <CircleSlash class="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                {:else}
                  <Check class="h-3.5 w-3.5 shrink-0 text-ok" />
                {/if}
                <span class="min-w-0 flex-1 truncate">
                  {$_(
                    app.status === 'disabled'
                      ? 'notifications.apps.connectedToInactive'
                      : 'notifications.apps.connectedTo',
                    { values: { name: installation.name } },
                  )}
                </span>
                {#if app.canRemove && removeFormAction}
                  <!-- without JavaScript the form posts directly; with it, a modal confirms first -->
                  <form method="POST" action="{action}?/{removeFormAction}">
                    <input type="hidden" name="workspaceId" value={installation.id} />
                    <button
                      type="submit"
                      class="k-btn k-btn-ghost k-btn-sm h-7 px-2 hover:text-red-400"
                      disabled={busy !== null}
                      onclick={(event) => openRemove(event, app.provider, installation)}
                      data-testid="app-remove"
                    >
                      <Power class="h-3.5 w-3.5" />{$_('notifications.apps.remove')}
                    </button>
                  </form>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if app.status === 'available' && app.canInstall && installAction}
          <form
            method="POST"
            action="{action}?/{installAction}"
            use:enhance={installApp}
            class="mt-auto"
          >
            <input type="hidden" name="locale" value={$uiLocale} />
            <input type="hidden" name="returnTo" value={action} />
            <button
              type="submit"
              class="k-btn k-btn-secondary k-btn-sm w-full"
              disabled={busy !== null}
              data-testid="app-install"
            >
              {#if busy === 'install'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
                  class="h-4 w-4"
                />{/if}
              {$_('notifications.apps.install')}
            </button>
          </form>
        {:else if app.status === 'disabled'}
          <p class="k-help mt-auto" data-testid="app-disabled-hint">
            {#if app.setupPath}
              {$_('notifications.apps.setupHint')}
              <a href={app.setupPath} class="text-brand-400 hover:underline" data-testid="app-setup"
                >{$_('notifications.channels.slackSetupLink')}</a
              >
            {:else}
              {$_('notifications.apps.askAdmin')}
            {/if}
          </p>
        {/if}
      </div>
    {/each}
  </div>
</section>

{#if apps.some((app) => app.canRemove)}
  <Modal
    bind:open={removeOpen}
    role="alertdialog"
    size="sm"
    title={$_('notifications.channels.slackAppRemoveTitle', {
      values: { team: removeTarget?.name ?? '' },
    })}
    description={$_('notifications.channels.slackAppRemoveConfirm')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Power class="h-5 w-5" /></span
      >
    {/snippet}
    <form
      id="app-installation-remove-form"
      method="POST"
      action="{action}?/{removeAction ?? ''}"
      use:enhance={remove}
    >
      <input type="hidden" name="workspaceId" value={removeTarget?.id ?? ''} />
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (removeOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="app-installation-remove-form"
        class="k-btn k-btn-danger"
        disabled={busy !== null}
        data-autofocus
      >
        {#if busy === 'remove'}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('notifications.channels.slackAppRemove')}
      </button>
    {/snippet}
  </Modal>
{/if}
