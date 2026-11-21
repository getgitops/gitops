<script lang="ts">
  import { Building2, Check, Info, KeyRound, Lock, Mail, ShieldCheck } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { GoogleSsoStatus } from '#modules/auth';

  let { data }: { data: { googleSso: GoogleSsoStatus } } = $props();

  type Status = 'on' | 'off' | 'soon';

  const google = $derived(data.googleSso);
  const activeMethods = $derived(1 + (google.enabled ? 1 : 0));

  const statusLabel: Record<Status, string> = $derived({
    on: $_('orgSettings.global.auth.statusOn'),
    off: $_('orgSettings.global.auth.statusOff'),
    soon: $_('common.comingSoon'),
  });
</script>

<svelte:head>
  <title>{$_('orgSettings.global.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

{#snippet pill(status: Status, label = statusLabel[status])}
  <span class="pill pill-{status}">
    <span class="pill-dot"></span>
    {label}
  </span>
{/snippet}

<div class="global-settings">
  <header class="section-head">
    <div>
      <h2>{$_('orgSettings.global.auth.title')}</h2>
      <p>{$_('orgSettings.global.auth.description')}</p>
    </div>
    <span class="summary" title={$_('orgSettings.global.auth.summaryHint')}>
      <ShieldCheck class="h-3.5 w-3.5" />
      {$_('orgSettings.global.auth.summary', { values: { active: activeMethods, total: 3 } })}
    </span>
  </header>

  <div class="auth-grid">
    <!-- Local: email + password, always available -->
    <article class="auth-card is-on">
      <div class="card-top">
        <span class="method-icon"><Mail class="h-[18px] w-[18px]" /></span>
        {@render pill('on', $_('orgSettings.global.auth.alwaysOn'))}
      </div>
      <h3>{$_('orgSettings.global.auth.local.name')}</h3>
      <p class="card-text">{$_('orgSettings.global.auth.local.description')}</p>

      <ul class="facts">
        <li>
          <Check class="fact-icon" />
          {$_('orgSettings.global.auth.local.factRecovery')}
        </li>
        <li>
          <Check class="fact-icon" />
          {$_('orgSettings.global.auth.local.factFallback')}
        </li>
      </ul>

      <footer class="card-foot">
        <Lock class="h-3.5 w-3.5" />
        {$_('orgSettings.global.auth.local.footer')}
      </footer>
    </article>

    <!-- Google Workspace: cluster-wide, configured through GOOGLE_SSO_* -->
    <article class="auth-card" class:is-on={google.enabled}>
      <div class="card-top">
        <span class="method-icon"><Building2 class="h-[18px] w-[18px]" /></span>
        {@render pill(google.enabled ? 'on' : 'off')}
      </div>
      <h3>{$_('orgSettings.global.auth.google.name')}</h3>
      <p class="card-text">{$_('orgSettings.global.auth.google.description')}</p>

      {#if google.enabled}
        <dl class="details">
          <div>
            <dt>{$_('orgSettings.global.auth.google.domains')}</dt>
            <dd>
              {#if google.allowedDomains.length}
                <span class="chips">
                  {#each google.allowedDomains as domain (domain)}
                    <code class="chip">{domain}</code>
                  {/each}
                </span>
              {:else}
                {$_('orgSettings.global.auth.google.anyDomain')}
              {/if}
            </dd>
          </div>
          <div>
            <dt>{$_('orgSettings.global.auth.google.autoProvision')}</dt>
            <dd>
              {google.autoProvision
                ? $_('orgSettings.global.auth.google.autoProvisionOn')
                : $_('orgSettings.global.auth.google.autoProvisionOff')}
            </dd>
          </div>
        </dl>
      {:else}
        <div class="setup">
          <p>{$_('orgSettings.global.auth.google.setup')}</p>
          <span class="chips">
            <code class="chip">GOOGLE_SSO_CLIENT_ID</code>
            <code class="chip">GOOGLE_SSO_CLIENT_SECRET</code>
          </span>
        </div>
      {/if}

      <footer class="card-foot">
        <Lock class="h-3.5 w-3.5" />
        {$_('orgSettings.global.auth.google.footer')}
      </footer>
    </article>

    <!-- SAML: not implemented yet -->
    <article class="auth-card is-soon">
      <div class="card-top">
        <span class="method-icon"><KeyRound class="h-[18px] w-[18px]" /></span>
        {@render pill('soon')}
      </div>
      <h3>{$_('orgSettings.global.auth.saml.name')}</h3>
      <p class="card-text">{$_('orgSettings.global.auth.saml.description')}</p>

      <ul class="facts muted">
        <li>
          <Check class="fact-icon" />
          {$_('orgSettings.global.auth.saml.factProviders')}
        </li>
        <li>
          <Check class="fact-icon" />
          {$_('orgSettings.global.auth.saml.factEnforce')}
        </li>
      </ul>

      <footer class="card-foot">
        <Info class="h-3.5 w-3.5" />
        {$_('orgSettings.global.auth.saml.footer')}
      </footer>
    </article>
  </div>

  <p class="note">
    <Info class="h-3.5 w-3.5 shrink-0" />
    <span>{$_('orgSettings.global.auth.note')}</span>
  </p>
</div>

<style>
  .global-settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Section header: Linear-style, small title + muted description, meta on the right */
  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }

  .section-head h2 {
    color: #ece8ee;
    font-size: 17px;
    font-weight: 560;
    letter-spacing: -0.2px;
  }

  .section-head p {
    max-width: 620px;
    margin-top: 4px;
    color: #8a858d;
    font-size: 13.5px;
    line-height: 1.5;
  }

  .summary {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.03);
    color: #b9b4bc;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  /* Cards */
  .auth-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 1100px) {
    .auth-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .auth-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .section-head {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .auth-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 268px;
    padding: 18px 18px 0;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.015));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
    transition:
      border-color 160ms ease,
      background 160ms ease;
  }

  .auth-card:hover {
    border-color: rgb(255 255 255 / 0.11);
  }

  /* Thin accent line on top of the active methods */
  .auth-card.is-on::before {
    position: absolute;
    top: -1px;
    right: 18px;
    left: 18px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(74 222 128 / 0.55), transparent);
    content: '';
  }

  .auth-card.is-soon {
    background: rgb(255 255 255 / 0.012);
  }

  .auth-card.is-soon :is(.method-icon, h3, .card-text) {
    opacity: 0.6;
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .method-icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.04);
    color: #d8d3da;
  }

  .is-on .method-icon {
    border-color: rgb(249 93 17 / 0.25);
    background: rgb(249 93 17 / 0.1);
    color: #ff8a4c;
  }

  /* The settings layout forces every h3 (and the p after it) to section-title sizes with
     !important; inside a card they are card titles, so these win on specificity */
  .auth-grid .auth-card h3 {
    color: #ece8ee !important;
    font-size: 14.5px !important;
    font-weight: 560 !important;
  }

  .auth-grid .auth-card .card-text {
    margin-top: 5px !important;
    color: #8a858d !important;
    font-size: 13px !important;
    line-height: 1.5;
  }

  /* Status pills */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 520;
    white-space: nowrap;
  }

  .pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .pill-on {
    border-color: rgb(74 222 128 / 0.2);
    background: rgb(74 222 128 / 0.08);
    color: #6ee7a0;
  }

  .pill-on .pill-dot {
    box-shadow: 0 0 0 3px rgb(74 222 128 / 0.15);
  }

  .pill-off {
    border-color: rgb(255 255 255 / 0.08);
    background: rgb(255 255 255 / 0.04);
    color: #9d98a0;
  }

  .pill-soon {
    border-color: rgb(251 191 36 / 0.2);
    background: rgb(251 191 36 / 0.07);
    color: #f6c860;
  }

  /* Card body variants */
  .facts {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 16px;
    color: #b9b4bc;
    font-size: 12.5px;
  }

  .facts li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.45;
  }

  .facts :global(.fact-icon) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin-top: 1px;
    color: #6ee7a0;
  }

  .facts.muted {
    color: #7f7983;
  }

  .facts.muted :global(.fact-icon) {
    color: #625e65;
  }

  .details {
    display: flex;
    flex-direction: column;
    margin-top: 16px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .details > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 38px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
    font-size: 12.5px;
  }

  .details dt {
    color: #8a858d;
  }

  .details dd {
    color: #ded9df;
    text-align: right;
  }

  .setup {
    margin-top: 16px;
    padding: 11px 12px;
    border: 1px dashed rgb(255 255 255 / 0.1);
    border-radius: 9px;
    color: #8a858d;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
  }

  .setup .chips {
    justify-content: flex-start;
    margin-top: 8px;
  }

  .chip {
    padding: 2px 6px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 5px;
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .card-foot {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: auto -18px 0;
    padding: 11px 18px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
    color: #77737a;
    font-size: 12px;
  }

  .auth-card > :global(*:nth-last-child(2)) {
    margin-bottom: 18px;
  }

  .note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: #77737a;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .note :global(svg) {
    margin-top: 2px;
  }
</style>
