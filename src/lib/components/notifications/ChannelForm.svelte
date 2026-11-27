<!--
  Formulario "Nuevo canal": tipo (tarjetas sobre radios nativos, funciona sin JavaScript), nombre,
  URL e idioma. Con Slack elegido, "Añadir a Slack" manda el mismo formulario a `connectSlack`.
  Un tipo desactivado en esta instalación (Slack sin su app configurada) ni siquiera aparece.
  - variant="inline": tarjeta con su propio botón (sin JavaScript).
  - variant="modal": el botón de crear lo pone el Modal en su pie, con form={formId}.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Check, Hash, LoaderCircle, Plus } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _, SUPPORTED_LOCALES, locale as uiLocale } from '#lib/i18n';
  import type { ChannelsFormResult, ChannelsSectionData } from '#lib/notifications/types';
  import { errorMessage, typeDescriptions, typeIcon } from './channel-ui';

  type Props = {
    data: ChannelsSectionData;
    action: string;
    form?: ChannelsFormResult;
    formId: string;
    variant?: 'inline' | 'modal';
    /** Which submission is running (`create` / `slack`): the modal footer shows it too. */
    busy?: string | null;
    /** The channel was created; `result` may carry its signing secret (shown once). */
    oncreated?: (result: Record<string, unknown> | undefined) => void;
  };
  let {
    data,
    action,
    form = null,
    formId,
    variant = 'inline',
    busy = $bindable(null),
    oncreated,
  }: Props = $props();

  const available = $derived(
    data.channelTypes.filter((option) => option.status === 'available').map(({ type }) => type),
  );
  let createType = $state('');
  const selectedType = $derived(
    createType && available.includes(createType)
      ? createType
      : form?.channelDraft?.type && available.includes(form.channelDraft.type)
        ? form.channelDraft.type
        : (available[0] ?? ''),
  );
  /** Slack picked: the Slack app gives the name and the URL ("Add to Slack"). */
  const slackConnectMode = $derived(data.slackConnect && selectedType === 'slack');

  let createErrors = $state<Record<string, string>>({});
  const errors = $derived({
    ...(form?.channelForm === 'create' ? (form.channelErrors ?? {}) : {}),
    ...createErrors,
  });
  const errorText = (key: string) => (errors[key] ? $_(`notifications.errors.${errors[key]}`) : '');

  const createManual: SubmitFunction = () => {
    busy = 'create';
    return async ({ result }) => {
      busy = null;
      if (result.type === 'success') {
        createErrors = {};
        toast.success($_('notifications.channels.created'));
        oncreated?.(result.data);
        await invalidateAll();
      } else if (result.type === 'failure') {
        const fieldErrors = (result.data?.channelErrors as Record<string, string>) ?? {};
        if (Object.keys(fieldErrors).length > 0) createErrors = fieldErrors;
        else
          toast.error(
            errorMessage($_, result.data?.channelError ? String(result.data.channelError) : ''),
          );
      } else {
        toast.error($_('alerts.wizard.failed'));
      }
    };
  };

  /** "Add to Slack" submits the create form to `connectSlack`, which answers with Slack's URL. */
  const submit: SubmitFunction = (input) => {
    if (!input.submitter?.hasAttribute('data-slack-connect')) return createManual(input);
    busy = 'slack';
    return async ({ result }) => {
      if (result.type === 'redirect') {
        // an external page: leave the app (busy stays on while the browser navigates)
        window.location.assign(result.location);
        return;
      }
      busy = null;
      toast.error(
        result.type === 'failure'
          ? errorMessage($_, result.data?.channelError ? String(result.data.channelError) : '')
          : $_('alerts.wizard.failed'),
      );
    };
  };
</script>

{#snippet localeField(id: string)}
  <div>
    <label class="k-label" for={id}>{$_('notifications.channels.locale')}</label>
    <select
      {id}
      name="locale"
      class="k-input"
      aria-describedby="{id}-help"
      aria-invalid={Boolean(errors.locale) || undefined}
    >
      {#each SUPPORTED_LOCALES as option (option)}
        <option value={option} selected={(form?.channelDraft?.locale || $uiLocale) === option}
          >{$_(`notifications.channels.locales.${option}`)}</option
        >
      {/each}
    </select>
    {#if errors.locale}
      <p class="mt-1 text-xs text-red-300">{errorText('locale')}</p>
    {:else}
      <p id="{id}-help" class="k-help mt-1">{$_('notifications.channels.localeHelp')}</p>
    {/if}
  </div>
{/snippet}

{#if available.length === 0}
  <p class="k-help" data-testid="channel-types-unavailable">
    {$_('notifications.channels.noTypes')}
  </p>
{:else}
  <form
    id={formId}
    method="POST"
    action="{action}?/createChannel"
    use:enhance={submit}
    class="space-y-4"
    data-testid="channel-create-form"
  >
    <!-- native radios styled as cards: the form keeps working without JavaScript -->
    <fieldset
      aria-describedby={errors.type ? `${formId}-type-error` : undefined}
      data-testid="channel-type-cards"
    >
      <legend class="k-label">{$_('notifications.channels.type')}</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        {#each data.channelTypes as option (option.type)}
          {@const Icon = typeIcon(option.type)}
          {@const enabled = option.status === 'available'}
          {@const on = enabled && selectedType === option.type}
          <label
            class="relative flex flex-col items-start gap-2 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/60 {on
              ? 'border-brand-500/50 bg-brand-500/8'
              : enabled
                ? 'cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/2'
                : 'cursor-not-allowed border-white/8 opacity-55'}"
            data-channel-type={option.type}
          >
            <input
              type="radio"
              name="type"
              value={option.type}
              class="sr-only"
              checked={on}
              disabled={!enabled}
              onchange={() => (createType = option.type)}
            />
            <span
              class="grid h-8 w-8 place-items-center rounded-lg {on
                ? 'bg-brand-500/15 text-brand-400'
                : 'bg-white/5 text-fg-subtle'}"><Icon class="h-4 w-4" /></span
            >
            <span class="text-sm font-medium text-white">
              {$_(`notifications.channels.types.${option.type}`)}
            </span>
            <span class="text-xs text-fg-subtle">{$_(typeDescriptions[option.type] ?? '')}</span>
            {#if enabled}
              <span
                class="pointer-events-none absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border {on
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-white/15'}"
                >{#if on}<Check class="h-3.5 w-3.5" />{/if}</span
              >
            {:else}
              <span class="k-badge absolute right-3 top-3 h-5 px-1.5 text-[10px]"
                >{$_('notifications.channels.comingSoon')}</span
              >
            {/if}
          </label>
        {/each}
      </div>
      {#if errors.type}<p id="{formId}-type-error" class="mt-1 text-xs text-red-300">
          {errorText('type')}
        </p>{/if}
      {#if errors.scope}<p class="mt-1 text-xs text-red-300">{errorText('scope')}</p>{/if}
    </fieldset>
    <input type="hidden" name="returnTo" value={action} />

    {#if slackConnectMode}
      <!-- Enter in the manual fields creates the channel, not the Slack install: the implicit
           submission uses the form's first submit button -->
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true"></button>
      <div
        class="flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4"
        data-testid="slack-connect"
      >
        <div>
          <p class="text-sm font-medium text-white">
            {$_('notifications.channels.slackConnectTitle')}
          </p>
          <p class="mt-0.5 text-xs text-fg-subtle">
            {$_('notifications.channels.slackConnectDescription')}
          </p>
        </div>
        {@render localeField(`${formId}-locale`)}
        <div>
          <button
            type="submit"
            formaction="{action}?/connectSlack"
            class="k-btn k-btn-primary"
            disabled={busy !== null}
            data-slack-connect
            data-testid="slack-connect-submit"
          >
            {#if busy === 'slack'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Hash
                class="h-4 w-4"
              />{/if}
            {$_('notifications.channels.slackConnect')}
          </button>
        </div>
      </div>
      <p class="flex items-center gap-3 text-xs text-fg-subtle">
        <span class="h-px flex-1 bg-white/10"></span>
        {$_('notifications.channels.slackManual')}
        <span class="h-px flex-1 bg-white/10"></span>
      </p>
    {/if}

    <div>
      <label class="k-label" for="{formId}-name">{$_('notifications.channels.name')}</label>
      <input
        id="{formId}-name"
        name="name"
        maxlength="80"
        placeholder="#alertas-seguridad"
        value={form?.channelDraft?.name ?? ''}
        class="k-input"
        aria-invalid={Boolean(errors.name) || undefined}
        data-autofocus={slackConnectMode ? undefined : true}
      />
      {#if errors.name}<p class="mt-1 text-xs text-red-300">{errorText('name')}</p>{/if}
    </div>
    <div>
      <label class="k-label" for="{formId}-destination"
        >{$_('notifications.channels.destination')}</label
      >
      <input
        id="{formId}-destination"
        name="destination"
        type="url"
        autocomplete="off"
        placeholder={selectedType === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://…'}
        class="k-input font-mono"
        aria-invalid={Boolean(errors.destination) || undefined}
      />
      {#if errors.destination}
        <p class="mt-1 text-xs text-red-300">{errorText('destination')}</p>
      {:else if selectedType === 'webhook'}
        <p class="k-help mt-1">{$_('notifications.channels.webhookHelp')}</p>
      {:else if selectedType === 'slack'}
        <p class="k-help mt-1">{$_('notifications.channels.slackHelp')}</p>
      {/if}
    </div>
    {#if !slackConnectMode}
      {@render localeField(`${formId}-locale`)}
    {/if}

    {#if variant === 'inline'}
      <button
        type="submit"
        class="k-btn {slackConnectMode ? 'k-btn-secondary' : 'k-btn-primary'}"
        disabled={busy !== null}
        data-testid="channel-create-submit"
      >
        {#if busy === 'create'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
            class="h-4 w-4"
          />{/if}
        {$_('notifications.channels.create')}
      </button>
    {/if}
  </form>
{/if}
