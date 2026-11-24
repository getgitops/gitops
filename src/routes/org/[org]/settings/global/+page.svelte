<script lang="ts">
  import {
    Building2,
    CircleCheck,
    CircleDashed,
    Globe,
    KeyRound,
    LockKeyhole,
    RefreshCw,
    ShieldCheck,
    UserPlus,
    Vault,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { GoogleSsoStatus } from '#modules/auth';

  let { data }: { data: { googleSso: GoogleSsoStatus } } = $props();

  const google = $derived(data.googleSso);

  // Controles que se muestran en la postura. Solo cuentan los que existen de verdad;
  // SAML y el cifrado gestionado aún no están implementados.
  const checks = $derived([
    { label: $_('orgSettings.security.checkLocal'), active: true, soon: false },
    { label: $_('orgSettings.security.checkGoogle'), active: google.enabled, soon: false },
    { label: $_('orgSettings.security.checkSaml'), active: false, soon: true },
    { label: $_('orgSettings.security.checkEncryption'), active: false, soon: true },
  ]);
  const activeChecks = $derived(checks.filter((check) => check.active).length);
  const progress = $derived(Math.round((activeChecks / checks.length) * 100));

  const roadmap = $derived([
    {
      icon: RefreshCw,
      title: $_('orgSettings.security.keyRotation'),
      description: $_('orgSettings.security.keyRotationDescription'),
    },
    {
      icon: LockKeyhole,
      title: $_('orgSettings.security.encryptionPolicy'),
      description: $_('orgSettings.security.encryptionPolicyDescription'),
    },
    {
      icon: Vault,
      title: $_('orgSettings.security.scopedSecrets'),
      description: $_('orgSettings.security.scopedSecretsDescription'),
    },
  ]);
</script>

<svelte:head>
  <title>{$_('orgSettings.security.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-8">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('orgSettings.security.title')}
    </h1>
    <p class="mt-1 max-w-2xl text-sm text-fg-muted">{$_('orgSettings.security.description')}</p>
  </header>

  <!-- Postura de seguridad -->
  <section class="k-card relative overflow-hidden" aria-labelledby="security-posture-title">
    <div
      class="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl"
      aria-hidden="true"
    ></div>
    <div class="relative grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-7">
      <div class="flex flex-col justify-between gap-5">
        <div class="flex items-start gap-4">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-500/12 text-brand-400 ring-1 ring-brand-500/25"
          >
            <ShieldCheck class="h-6 w-6" />
          </span>
          <div>
            <h2 id="security-posture-title" class="text-base font-semibold text-white">
              {$_('orgSettings.security.postureTitle')}
            </h2>
            <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.security.postureHint')}</p>
          </div>
        </div>
        <div>
          <p class="flex items-baseline gap-2">
            <span class="text-3xl font-semibold tracking-tight text-white">{activeChecks}</span>
            <span class="text-sm text-fg-muted"
              >{$_('orgSettings.security.postureSummary', {
                values: { total: checks.length },
              })}</span
            >
          </p>
          <div
            class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={checks.length}
            aria-valuenow={activeChecks}
            aria-label={$_('orgSettings.security.postureTitle')}
          >
            <div
              class="h-full rounded-full bg-brand-500 transition-[width] duration-500"
              style:width="{progress}%"
            ></div>
          </div>
        </div>
      </div>

      <ul class="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
        {#each checks as check (check.label)}
          <li
            class="flex items-center gap-3 rounded-xl border px-3.5 py-3 {check.active
              ? 'border-ok/25 bg-ok/5'
              : 'border-white/8 bg-white/2'}"
          >
            {#if check.active}
              <CircleCheck class="h-4 w-4 shrink-0 text-ok" />
            {:else}
              <CircleDashed class="h-4 w-4 shrink-0 text-fg-subtle" />
            {/if}
            <span
              class="min-w-0 flex-1 truncate text-sm {check.active
                ? 'text-white'
                : 'text-fg-muted'}">{check.label}</span
            >
            <span class="shrink-0 text-[11px] {check.active ? 'text-ok' : 'text-fg-subtle'}">
              {check.active
                ? $_('orgSettings.security.on')
                : check.soon
                  ? $_('common.comingSoon')
                  : $_('orgSettings.security.off')}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- Proveedores de identidad -->
  <section class="space-y-4" aria-labelledby="identity-providers-title">
    <div>
      <h2 id="identity-providers-title" class="text-sm font-semibold text-white">
        {$_('orgSettings.security.identityTitle')}
      </h2>
      <p class="mt-0.5 text-xs text-fg-subtle">
        {$_('orgSettings.global.authenticationDescription')}
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <!-- Local -->
      <article class="k-card flex flex-col p-5">
        <div class="flex items-start justify-between gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-fg">
            <KeyRound class="h-5 w-5" />
          </span>
          <span class="k-badge k-badge-ok h-6 gap-1 px-2 text-[11px]">
            <CircleCheck class="h-3 w-3" />{$_('orgSettings.security.alwaysOn')}
          </span>
        </div>
        <h3 class="mt-4 text-sm font-semibold text-white">
          {$_('orgSettings.security.localTitle')}
        </h3>
        <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.global.localAuthDescription')}</p>
        <p class="mt-auto pt-4 text-xs text-fg-subtle">
          {$_('orgSettings.security.localFootnote')}
        </p>
      </article>

      <!-- Google Workspace -->
      <article
        class="k-card flex flex-col p-5 {google.enabled ? 'border-brand-500/30' : ''}"
        aria-label="Google Workspace"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid h-10 w-10 place-items-center rounded-xl {google.enabled
              ? 'bg-brand-500/12 text-brand-400'
              : 'bg-white/5 text-fg-subtle'}"
          >
            <Building2 class="h-5 w-5" />
          </span>
          {#if google.enabled}
            <span class="k-badge k-badge-ok h-6 gap-1 px-2 text-[11px]">
              <CircleCheck class="h-3 w-3" />{$_('orgSettings.global.googleClusterEnabledBadge')}
            </span>
          {:else}
            <span class="k-badge h-6 gap-1 px-2 text-[11px]">
              <CircleDashed class="h-3 w-3" />{$_('orgSettings.global.googleClusterDisabledBadge')}
            </span>
          {/if}
        </div>
        <h3 class="mt-4 text-sm font-semibold text-white">Google Workspace</h3>
        <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.global.googleDescription')}</p>

        {#if google.enabled}
          <dl class="mt-4 space-y-3 rounded-xl border border-white/8 bg-white/2 p-3.5 text-xs">
            <div>
              <dt class="flex items-center gap-1.5 text-fg-subtle">
                <Globe class="h-3.5 w-3.5" />{$_('orgSettings.security.allowedDomains')}
              </dt>
              <dd class="mt-1.5 flex flex-wrap gap-1.5">
                {#each google.allowedDomains as domain (domain)}
                  <span class="k-badge h-6 px-2 font-mono text-[11px]">{domain}</span>
                {:else}
                  <span class="text-fg-muted">{$_('orgSettings.security.anyDomain')}</span>
                {/each}
              </dd>
            </div>
            <div>
              <dt class="flex items-center gap-1.5 text-fg-subtle">
                <UserPlus class="h-3.5 w-3.5" />{$_('orgSettings.security.autoProvision')}
              </dt>
              <dd class="mt-1 text-fg-muted">
                {google.autoProvision
                  ? $_('orgSettings.security.autoProvisionOn')
                  : $_('orgSettings.security.autoProvisionOff')}
              </dd>
            </div>
          </dl>
          <p class="mt-auto pt-4 text-xs text-fg-subtle">
            {$_('orgSettings.global.googleClusterEnabled')}
          </p>
        {:else}
          <p class="mt-auto pt-4 text-xs text-fg-subtle">
            {$_('orgSettings.global.googleClusterDisabled')}
          </p>
        {/if}
      </article>

      <!-- SAML -->
      <article
        class="flex flex-col rounded-2xl border border-dashed border-white/10 p-5"
        aria-label="SAML"
      >
        <div class="flex items-start justify-between gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-fg-subtle">
            <ShieldCheck class="h-5 w-5" />
          </span>
          <span class="k-badge h-6 px-2 text-[11px]">{$_('common.comingSoon')}</span>
        </div>
        <h3 class="mt-4 text-sm font-semibold text-fg">SAML</h3>
        <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.global.samlDescription')}</p>
      </article>
    </div>
  </section>

  <!-- Cifrado y secretos -->
  <section class="space-y-4" aria-labelledby="encryption-title">
    <div>
      <h2 id="encryption-title" class="flex items-center gap-2 text-sm font-semibold text-white">
        {$_('orgSettings.global.encryption')}
        <span class="k-badge h-5 px-2 text-[11px]">{$_('common.comingSoon')}</span>
      </h2>
      <p class="mt-0.5 text-xs text-fg-subtle">
        {$_('orgSettings.global.comingSoonDescription')}
      </p>
    </div>
    <ul class="grid gap-4 sm:grid-cols-3">
      {#each roadmap as item (item.title)}
        <li class="flex items-start gap-3 rounded-2xl border border-dashed border-white/10 p-4">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-fg-subtle"
          >
            <item.icon class="h-4 w-4" />
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-medium text-fg">{item.title}</span>
            <span class="mt-0.5 block text-xs text-fg-subtle">{item.description}</span>
          </span>
        </li>
      {/each}
    </ul>
  </section>
</div>
