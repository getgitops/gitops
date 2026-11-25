<!--
  Perfil del usuario: cuenta (email), contraseña, idioma y conexiones. Las claves de API personales
  siguen ocultas (las acciones existen en el servidor, pero la interfaz no se ha publicado).
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    ShieldCheck,
    Languages,
    LoaderCircle,
    LockKeyhole,
    Mail,
    Save,
    UserRound,
  } from '@lucide/svelte';
  import { Field, toast } from '#lib/components/ui';
  import { _, setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '#lib/i18n';

  let {
    data,
  }: {
    data: { user: { id: string; username: string; email: string | null }; gcpConnected: boolean };
  } = $props();

  // valor inicial; tras guardar, el campo ya tiene lo que se guardó
  let email = $state(untrack(() => data.user.email ?? ''));
  const emailDirty = $derived(email.trim() !== (data.user.email ?? ''));
  let savingEmail = $state(false);
  let savingPassword = $state(false);
  let currentLocale = $state<SupportedLocale>('es');

  onMount(() => {
    try {
      currentLocale = (localStorage.getItem('gitops-locale') as SupportedLocale) ?? 'es';
    } catch {
      // sin almacenamiento: se queda el idioma por defecto
    }
  });

  const initials = $derived(
    data.user.username
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );

  function feedback(code: unknown, fallback: unknown) {
    return typeof code === 'string' ? $_(`profile.feedback.${code}`) : String(fallback ?? '');
  }

  const submitEmail: SubmitFunction = () => {
    savingEmail = true;
    return async ({ result, update }) => {
      savingEmail = false;
      if (result.type === 'success') {
        toast.success(feedback(result.data?.code, result.data?.message));
        await update({ reset: false });
      } else if (result.type === 'failure') {
        toast.error(feedback(result.data?.code, result.data?.message));
      } else {
        await update();
      }
    };
  };

  const submitPassword: SubmitFunction = () => {
    savingPassword = true;
    return async ({ result, update }) => {
      savingPassword = false;
      if (result.type === 'success') {
        toast.success(feedback(result.data?.code, result.data?.message));
        await update(); // vacía los campos
      } else if (result.type === 'failure') {
        toast.error(feedback(result.data?.code, result.data?.message));
      } else {
        await update();
      }
    };
  };

  function changeLocale(lang: SupportedLocale) {
    if (lang === currentLocale) return;
    currentLocale = lang;
    setLocale(lang);
    toast.success($_('profile.languageSaved'));
  }
</script>

<svelte:head>
  <title>{$_('profile.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <header class="flex flex-wrap items-center gap-4">
    <span
      class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-lg font-semibold text-white"
      aria-hidden="true">{initials}</span
    >
    <div class="min-w-0">
      <h1 class="truncate text-2xl font-semibold tracking-tight text-white">
        {data.user.username}
      </h1>
      <p class="mt-0.5 text-sm text-fg-muted">{data.user.email || $_('profile.notSet')}</p>
    </div>
  </header>

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Cuenta -->
    <form
      method="POST"
      action="?/updateProfile"
      use:enhance={submitEmail}
      class="k-card flex flex-col"
    >
      <div class="flex items-start gap-3 border-b border-white/8 px-5 py-4">
        <UserRound class="mt-0.5 h-4 w-4 text-brand-400" />
        <div>
          <h2 class="text-sm font-semibold text-white">{$_('profile.accountInformation')}</h2>
          <p class="mt-0.5 text-xs text-fg-subtle">{$_('profile.subtitle')}</p>
        </div>
      </div>
      <div class="flex-1 space-y-5 p-5">
        <div>
          <p class="k-label">{$_('profile.username')}</p>
          <p class="font-mono text-sm text-fg">{data.user.username}</p>
        </div>
        <Field id="email" label={$_('profile.email')}>
          {#snippet children(control)}
            <input
              {...control}
              name="email"
              type="email"
              autocomplete="email"
              class="k-input"
              placeholder="you@example.com"
              bind:value={email}
            />
          {/snippet}
        </Field>
      </div>
      <div class="flex justify-end rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-5 py-3">
        <button type="submit" class="k-btn k-btn-primary" disabled={savingEmail || !emailDirty}>
          {#if savingEmail}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
              class="h-4 w-4"
            />{/if}
          {$_('profile.saveChanges')}
        </button>
      </div>
    </form>

    <!-- Contraseña -->
    <form
      method="POST"
      action="?/updatePassword"
      use:enhance={submitPassword}
      class="k-card flex flex-col"
    >
      <div class="flex items-start gap-3 border-b border-white/8 px-5 py-4">
        <LockKeyhole class="mt-0.5 h-4 w-4 text-brand-400" />
        <h2 class="text-sm font-semibold text-white">{$_('profile.password')}</h2>
      </div>
      <div class="flex-1 space-y-5 p-5">
        <Field id="currentPassword" label={$_('profile.currentPassword')}>
          {#snippet children(control)}
            <input
              {...control}
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              class="k-input"
            />
          {/snippet}
        </Field>
        <div class="grid gap-5 sm:grid-cols-2">
          <Field
            id="newPassword"
            label={$_('profile.newPassword')}
            help={$_('profile.passwordHint')}
          >
            {#snippet children(control)}
              <input
                {...control}
                name="newPassword"
                type="password"
                autocomplete="new-password"
                minlength="8"
                class="k-input"
              />
            {/snippet}
          </Field>
          <Field id="confirmPassword" label={$_('profile.confirmPassword')}>
            {#snippet children(control)}
              <input
                {...control}
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                class="k-input"
              />
            {/snippet}
          </Field>
        </div>
      </div>
      <div class="flex justify-end rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-5 py-3">
        <button type="submit" class="k-btn k-btn-secondary" disabled={savingPassword}>
          {#if savingPassword}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
          {$_('profile.updatePassword')}
        </button>
      </div>
    </form>
  </div>

  <!-- Preferencias -->
  <section class="k-card" aria-labelledby="preferences-title">
    <h2
      id="preferences-title"
      class="border-b border-white/8 px-5 py-4 text-sm font-semibold text-white"
    >
      {$_('profile.preferences')}
    </h2>
    <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div class="flex items-start gap-3">
        <Languages class="mt-0.5 h-4 w-4 text-fg-subtle" />
        <div>
          <p class="text-sm font-medium text-white">{$_('profile.language')}</p>
          <p class="text-xs text-fg-subtle">{$_('profile.languageDescription')}</p>
        </div>
      </div>
      <div
        class="inline-flex rounded-[0.625rem] border border-white/10 bg-ink-900 p-0.5"
        role="radiogroup"
        aria-label={$_('profile.language')}
      >
        {#each SUPPORTED_LOCALES as lang (lang)}
          <button
            type="button"
            role="radio"
            aria-checked={currentLocale === lang}
            class="h-8 rounded-md px-3 text-sm font-medium transition-colors {currentLocale === lang
              ? 'bg-white/10 text-white'
              : 'text-fg-subtle hover:text-fg'}"
            onclick={() => changeLocale(lang)}
          >
            {lang === 'es' ? $_('profile.spanish') : $_('profile.english')}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Conexiones -->
  <section class="k-card" aria-labelledby="connections-title">
    <h2
      id="connections-title"
      class="border-b border-white/8 px-5 py-4 text-sm font-semibold text-white"
    >
      {$_('profile.connections')}
    </h2>
    <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div class="flex items-start gap-3">
        <ShieldCheck class="mt-0.5 h-4 w-4 text-fg-subtle" />
        <div>
          <p class="text-sm font-medium text-white">{$_('profile.googleSso')}</p>
          <p class="text-xs text-fg-subtle">{$_('profile.gcpDescription')}</p>
        </div>
      </div>
      <span class="k-badge {data.gcpConnected ? 'k-badge-ok' : ''}">
        <span class="h-1.5 w-1.5 rounded-full {data.gcpConnected ? 'bg-ok' : 'bg-fg-subtle'}"
        ></span>
        {data.gcpConnected ? $_('profile.connected') : $_('profile.notConnected')}
      </span>
    </div>
    <div class="flex items-center gap-3 border-t border-white/8 px-5 py-3 text-xs text-fg-subtle">
      <Mail class="h-3.5 w-3.5" />{data.user.email || $_('profile.notSet')}
    </div>
  </section>
</div>
