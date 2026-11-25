<!--
  Alta y edición de un backend de State IaC. Las credenciales nunca vuelven del servidor: en
  edición los campos salen vacíos y, si se dejan así, se conservan las guardadas.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { LoaderCircle } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { BackendView } from './types';

  type Props = {
    open: boolean;
    /** `null`: alta. */
    backend: BackendView | null;
  };
  let { open = $bindable(false), backend }: Props = $props();

  let provider = $state<'gcs' | 's3'>('gcs');
  let auth = $state<'ambient' | 'credentials'>('ambient');
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);

  // each opening starts from the backend being edited (or from scratch)
  $effect(() => {
    if (!open) return;
    provider = backend?.provider ?? 'gcs';
    auth = backend?.auth ?? 'ambient';
    errors = {};
  });

  const formId = $derived(backend ? `state-backend-edit-${backend.id}` : 'state-backend-create');

  function errorText(key: string) {
    return errors[key] ? $_(`stateIac.errors.${errors[key]}`) : null;
  }

  const submit: SubmitFunction = () => {
    saving = true;
    return async ({ result }) => {
      saving = false;
      if (result.type === 'success') {
        open = false;
        toast.success(backend ? $_('stateIac.backends.saved') : $_('stateIac.backends.created'));
        await invalidateAll();
      } else if (result.type === 'failure') {
        const fieldErrors = (result.data?.errors as Record<string, string>) ?? {};
        errors = fieldErrors;
        if (Object.keys(fieldErrors).length === 0) toast.error($_('stateIac.backends.saveFailed'));
      } else {
        toast.error($_('stateIac.backends.saveFailed'));
      }
    };
  };
</script>

<Modal
  bind:open
  size="lg"
  dismissible={!saving}
  title={backend ? $_('stateIac.backends.editTitle') : $_('stateIac.backends.createTitle')}
  description={backend ? backend.name : $_('stateIac.backends.createDescription')}
>
  <form
    id={formId}
    method="POST"
    action={backend ? '?/updateBackend' : '?/createBackend'}
    use:enhance={submit}
    class="grid gap-4 sm:grid-cols-2"
  >
    {#if backend}<input type="hidden" name="backendId" value={backend.id} />{/if}

    <Field label={$_('stateIac.backends.fields.name')} error={errorText('name')} required>
      {#snippet children(control)}
        <input
          {...control}
          name="name"
          class="k-input"
          maxlength="80"
          placeholder="gcs-prod"
          value={backend?.name ?? ''}
          data-autofocus
        />
      {/snippet}
    </Field>

    <Field
      label={$_('stateIac.backends.fields.provider')}
      error={errorText('provider')}
      help={backend ? $_('stateIac.backends.providerImmutable') : undefined}
    >
      {#snippet children(control)}
        <select
          {...control}
          name={backend ? undefined : 'provider'}
          class="k-input"
          bind:value={provider}
          disabled={Boolean(backend)}
        >
          <option value="gcs">{$_('stateIac.providers.gcs')}</option>
          <option value="s3">{$_('stateIac.providers.s3')}</option>
        </select>
      {/snippet}
    </Field>

    <Field label={$_('stateIac.backends.fields.bucket')} error={errorText('bucket')} required>
      {#snippet children(control)}
        <input
          {...control}
          name="bucket"
          class="k-input font-mono"
          autocomplete="off"
          placeholder="acme-pulumi-state"
          value={backend?.bucket ?? ''}
        />
      {/snippet}
    </Field>

    <Field
      label={$_('stateIac.backends.fields.prefix')}
      help={$_('stateIac.backends.prefixHelp')}
      error={errorText('prefix')}
    >
      {#snippet children(control)}
        <input
          {...control}
          name="prefix"
          class="k-input font-mono"
          autocomplete="off"
          placeholder="infra"
          value={backend?.prefix ?? ''}
        />
      {/snippet}
    </Field>

    {#if provider === 's3'}
      <Field label={$_('stateIac.backends.fields.region')} error={errorText('region')}>
        {#snippet children(control)}
          <input
            {...control}
            name="region"
            class="k-input font-mono"
            placeholder="eu-west-1"
            value={backend?.region ?? ''}
          />
        {/snippet}
      </Field>
      <Field
        label={$_('stateIac.backends.fields.endpoint')}
        help={$_('stateIac.backends.endpointHelp')}
        error={errorText('endpoint')}
      >
        {#snippet children(control)}
          <input
            {...control}
            name="endpoint"
            type="url"
            class="k-input font-mono"
            placeholder="https://minio.internal:9000"
            value={backend?.endpoint ?? ''}
          />
        {/snippet}
      </Field>
      <label class="flex items-center gap-2 text-sm text-fg-muted sm:col-span-2">
        <input
          type="checkbox"
          name="forcePathStyle"
          class="k-checkbox"
          checked={backend?.forcePathStyle ?? false}
        />
        {$_('stateIac.backends.fields.forcePathStyle')}
      </label>
    {/if}

    <fieldset class="space-y-2 sm:col-span-2">
      <legend class="k-label">{$_('stateIac.backends.fields.auth')}</legend>
      <label class="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="auth"
          value="ambient"
          class="k-checkbox mt-0.5"
          bind:group={auth}
        />
        <span>
          <span class="font-medium text-fg">{$_('stateIac.auth.ambient')}</span>
          <span class="block text-xs text-fg-subtle"
            >{provider === 'gcs'
              ? $_('stateIac.auth.ambientHelpGcs')
              : $_('stateIac.auth.ambientHelpS3')}</span
          >
        </span>
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="auth"
          value="credentials"
          class="k-checkbox mt-0.5"
          bind:group={auth}
        />
        <span>
          <span class="font-medium text-fg">{$_('stateIac.auth.credentials')}</span>
          <span class="block text-xs text-fg-subtle">{$_('stateIac.auth.credentialsHelp')}</span>
        </span>
      </label>
    </fieldset>

    {#if auth === 'credentials'}
      {#if backend?.hasCredentials}
        <p class="k-help sm:col-span-2" data-testid="credentials-kept">
          {$_('stateIac.backends.credentialsKept')}
        </p>
      {/if}
      {#if provider === 'gcs'}
        <div class="sm:col-span-2">
          <Field
            label={$_('stateIac.backends.fields.serviceAccountJson')}
            error={errorText('credentials')}
          >
            {#snippet children(control)}
              <textarea
                {...control}
                name="serviceAccountJson"
                rows="5"
                class="k-input font-mono text-xs"
                autocomplete="off"
                spellcheck="false"
                placeholder={'{ "type": "service_account", … }'}></textarea>
            {/snippet}
          </Field>
        </div>
      {:else}
        <Field label={$_('stateIac.backends.fields.accessKeyId')} error={errorText('credentials')}>
          {#snippet children(control)}
            <input {...control} name="accessKeyId" class="k-input font-mono" autocomplete="off" />
          {/snippet}
        </Field>
        <Field label={$_('stateIac.backends.fields.secretAccessKey')}>
          {#snippet children(control)}
            <input
              {...control}
              name="secretAccessKey"
              type="password"
              class="k-input font-mono"
              autocomplete="new-password"
            />
          {/snippet}
        </Field>
        <div class="sm:col-span-2">
          <Field
            label={$_('stateIac.backends.fields.sessionToken')}
            help={$_('stateIac.backends.sessionTokenHelp')}
          >
            {#snippet children(control)}
              <input
                {...control}
                name="sessionToken"
                type="password"
                class="k-input font-mono"
                autocomplete="new-password"
              />
            {/snippet}
          </Field>
        </div>
      {/if}
    {/if}

    <p class="k-help sm:col-span-2">{$_('stateIac.backends.readOnlyNotice')}</p>
  </form>

  {#snippet footer()}
    <button
      type="button"
      class="k-btn k-btn-secondary"
      onclick={() => (open = false)}
      disabled={saving}>{$_('common.cancel')}</button
    >
    <button type="submit" form={formId} class="k-btn k-btn-primary" disabled={saving}>
      {#if saving}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {backend ? $_('stateIac.backends.save') : $_('stateIac.backends.create')}
    </button>
  {/snippet}
</Modal>
