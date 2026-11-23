<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { page } from '$app/state';
  import {
    Archive,
    ArchiveRestore,
    ArrowUpRight,
    BarChart3,
    Bot,
    Building2,
    Check,
    CircleAlert,
    Copy,
    GitBranch,
    Lock,
    Shield,
    Terminal,
    Trash2,
    X,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

  type ProjectModules = { vault: boolean; codereport: boolean; stateiac: boolean };

  type Props = {
    data: {
      project: {
        id: string;
        name: string;
        slug: string;
        description?: string | null;
        status: 'active' | 'inactive';
        modules: ProjectModules;
        createdAt: string;
        updatedAt: string;
      };
      canUpdate: boolean;
      canDelete: boolean;
    };
  };

  let { data }: Props = $props();

  const project = $derived(data.project);
  const canUpdate = $derived(data.canUpdate);
  const orgSlug = $derived(page.params.org ?? '');
  const base = $derived(`/org/${orgSlug}/projects/${project.slug}`);
  const isArchived = $derived(project.status === 'inactive');

  // form state, reset from the server after every successful save
  let name = $state('');
  let slug = $state('');
  let description = $state('');
  let modules = $state<ProjectModules>({ vault: true, codereport: true, stateiac: false });
  $effect.pre(() => {
    name = data.project.name;
    slug = data.project.slug;
    description = data.project.description ?? '';
    modules = { ...data.project.modules };
  });

  let saving = $state(false);
  let message = $state<{ tone: 'success' | 'error'; text: string } | null>(null);
  let slugCopied = $state(false);
  let modal = $state<'archive' | 'delete' | null>(null);
  let modalBusy = $state(false);
  let deleteConfirmation = $state('');

  const dirty = $derived(
    name !== project.name ||
      slug !== project.slug ||
      description !== (project.description ?? '') ||
      modules.vault !== project.modules.vault ||
      modules.codereport !== project.modules.codereport,
  );

  const MODULES = $derived([
    {
      key: 'vault' as const,
      label: 'Vault',
      icon: Shield,
      description: $_('project.vault.description'),
      href: `${base}/vault`,
      soon: false,
    },
    {
      key: 'codereport' as const,
      label: 'Code Report',
      icon: BarChart3,
      description: $_('project.layout.codeReportSubtitle'),
      href: `${base}/code-report/dashboard`,
      soon: false,
    },
    {
      key: 'stateiac' as const,
      label: 'State IaC',
      icon: GitBranch,
      description: $_('project.layout.stateIacSubtitle'),
      href: `${base}/state-iac`,
      // the service keeps State IaC off until it ships
      soon: true,
    },
  ]);

  function flash(tone: 'success' | 'error', text: string) {
    message = { tone, text };
    if (tone === 'success') setTimeout(() => message?.text === text && (message = null), 3000);
  }

  function discard() {
    name = project.name;
    slug = project.slug;
    description = project.description ?? '';
    modules = { ...project.modules };
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(project.slug);
      slugCopied = true;
      setTimeout(() => (slugCopied = false), 2000);
    } catch {
      flash('error', $_('projectSettings.overview.copyFailed'));
    }
  }

  const save: SubmitFunction = ({ cancel }) => {
    message = null;
    if (!name.trim()) {
      flash('error', $_('projectSettings.overview.nameRequired'));
      cancel();
      return;
    }
    saving = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      saving = false;
      if (result.type === 'success') flash('success', $_('projectSettings.overview.updated'));
      else if (result.type === 'failure')
        flash('error', String(result.data?.error ?? $_('projectSettings.overview.updateFailed')));
    };
  };

  function closeModal() {
    if (modalBusy) return;
    modal = null;
    deleteConfirmation = '';
  }

  const confirmArchive: SubmitFunction = () => {
    modalBusy = true;
    const wasArchived = isArchived;
    return async ({ result, update }) => {
      await update({ reset: false });
      modalBusy = false;
      if (result.type === 'success') {
        modal = null;
        flash(
          'success',
          wasArchived
            ? $_('projectSettings.overview.reactivated')
            : $_('projectSettings.overview.archived'),
        );
      } else if (result.type === 'failure') {
        flash(
          'error',
          String(result.data?.error ?? $_('projectSettings.overview.statusUpdateFailed')),
        );
      }
    };
  };

  const confirmDelete: SubmitFunction = () => {
    modalBusy = true;
    return async ({ result, update }) => {
      await update();
      modalBusy = false;
      if (result.type === 'failure') {
        flash('error', String(result.data?.error ?? $_('projectSettings.overview.deleteFailed')));
        modal = null;
      }
    };
  };
</script>

<div class="global">
  {#if message}
    <p class="banner banner-{message.tone}" role={message.tone === 'error' ? 'alert' : 'status'}>
      {#if message.tone === 'success'}<Check class="h-4 w-4" />{:else}<CircleAlert
          class="h-4 w-4"
        />{/if}
      {message.text}
    </p>
  {/if}

  {#if !canUpdate}
    <p class="banner banner-muted">
      <Lock class="h-4 w-4" />
      {$_('projectSettings.global.readOnly')}
    </p>
  {/if}

  <form method="POST" action="?/updateProject" use:enhance={save} class="stack">
    <input type="hidden" name="id" value={project.id} />
    <input type="hidden" name="moduleVault" value={modules.vault ? 'on' : ''} />
    <input type="hidden" name="moduleCodeReport" value={modules.codereport ? 'on' : ''} />
    <input type="hidden" name="moduleStateIac" value="" />

    <!-- General -->
    <section class="section">
      <header class="section-head">
        <div>
          <h2>{$_('projectSettings.global.generalTitle')}</h2>
          <p>{$_('projectSettings.global.generalDescription')}</p>
        </div>
        {#if isArchived}
          <span class="pill pill-warning"
            ><span class="dot"></span>{$_('projectSettings.overview.archivedBadge')}</span
          >
        {:else}
          <span class="pill pill-on"><span class="dot"></span>{$_('common.active')}</span>
        {/if}
      </header>

      <div class="card">
        <div class="row">
          <div class="row-label">
            <label for="edit-project-name">{$_('common.name')}</label>
            <p>{$_('projectSettings.global.nameHelp')}</p>
          </div>
          <div class="row-control">
            {#if canUpdate}
              <input
                id="edit-project-name"
                name="name"
                class="control"
                bind:value={name}
                maxlength="120"
              />
            {:else}
              <p class="value">{project.name}</p>
            {/if}
          </div>
        </div>

        <div class="row">
          <div class="row-label">
            <label for="edit-project-slug">{$_('common.slug')}</label>
            <p>{$_('projectSettings.global.slugHelp')}</p>
          </div>
          <div class="row-control">
            <div class="slug">
              <span class="slug-prefix">/projects/</span>
              {#if canUpdate}
                <input
                  id="edit-project-slug"
                  name="slug"
                  class="slug-input"
                  bind:value={slug}
                  spellcheck="false"
                />
              {:else}
                <span class="slug-input readonly">{project.slug}</span>
              {/if}
              <button
                type="button"
                class="slug-copy"
                onclick={copySlug}
                title={$_('projectSettings.overview.copyProjectSlug')}
                aria-label={$_('projectSettings.overview.copyProjectSlug')}
              >
                {#if slugCopied}<Check class="h-3.5 w-3.5" />{:else}<Copy
                    class="h-3.5 w-3.5"
                  />{/if}
              </button>
            </div>
            {#if canUpdate && slug !== project.slug}
              <p class="hint-warning">
                <CircleAlert class="h-3.5 w-3.5" />
                {$_('projectSettings.global.slugChangeWarning')}
              </p>
            {/if}
          </div>
        </div>

        <div class="row">
          <div class="row-label">
            <label for="edit-project-description">{$_('common.description')}</label>
            <p>{$_('projectSettings.global.descriptionHelp')}</p>
          </div>
          <div class="row-control">
            {#if canUpdate}
              <textarea
                id="edit-project-description"
                name="description"
                class="control"
                rows="3"
                bind:value={description}
                placeholder={$_('projectSettings.overview.optionalDescription')}></textarea>
            {:else}
              <p class="value" class:muted={!project.description}>
                {project.description || $_('projectSettings.global.noDescription')}
              </p>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <!-- Modules -->
    <section class="section">
      <header class="section-head">
        <div>
          <h2>{$_('projectSettings.overview.modules')}</h2>
          <p>{$_('projectSettings.global.modulesDescription')}</p>
        </div>
      </header>

      <div class="modules">
        {#each MODULES as module (module.key)}
          {@const on = modules[module.key] && !module.soon}
          {@const Icon = module.icon}
          <label class="module" class:on class:soon={module.soon} class:locked={!canUpdate}>
            <span class="module-top">
              <span class="module-icon"><Icon class="h-[18px] w-[18px]" /></span>
              {#if module.soon}
                <span class="pill pill-soon"
                  ><span class="dot"></span>{$_('common.comingSoon')}</span
                >
              {:else}
                <input
                  type="checkbox"
                  class="switch-input"
                  checked={on}
                  disabled={!canUpdate}
                  aria-label={`${module.label}: ${on ? $_('projectSettings.overview.moduleActive') : $_('projectSettings.overview.moduleDisabled')}`}
                  onchange={() => (modules = { ...modules, [module.key]: !modules[module.key] })}
                />
                <span class="switch" aria-hidden="true"></span>
              {/if}
            </span>
            <strong>{module.label}</strong>
            <span class="module-description">{module.description}</span>
            <span class="module-foot">
              {#if module.soon}
                {$_('projectSettings.global.moduleSoon')}
              {:else if on}
                <a href={module.href}
                  >{$_('projectSettings.overview.open')} <ArrowUpRight class="h-3 w-3" /></a
                >
              {:else}
                {$_('projectSettings.overview.moduleDisabled')}
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </section>

    {#if canUpdate}
      <div class="savebar" class:visible={dirty}>
        <span
          >{dirty
            ? $_('projectSettings.global.unsaved')
            : $_('projectSettings.global.upToDate')}</span
        >
        <div class="savebar-actions">
          {#if dirty}
            <button type="button" class="ghost" onclick={discard} disabled={saving}>
              {$_('projectSettings.global.discard')}
            </button>
          {/if}
          <button type="submit" class="primary" disabled={saving || !dirty}>
            {saving ? $_('common.saving') : $_('projectSettings.overview.saveChanges')}
          </button>
        </div>
      </div>
    {/if}
  </form>

  <!-- Integrations -->
  <section class="section">
    <header class="section-head">
      <div>
        <h2>{$_('projectSettings.overview.integrations')}</h2>
        <p>{$_('projectSettings.overview.integrationsDescription')}</p>
      </div>
    </header>
    <div class="integrations">
      <a
        class="integration"
        href="https://getgitops.com/docs/cli"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="module-icon"><Terminal class="h-[18px] w-[18px]" /></span>
        <span class="integration-body">
          <strong>GitOps CLI</strong>
          <span
            >{$_('projectSettings.overview.gitopsCliDescription', {
              values: { slug: project.slug },
            })}</span
          >
        </span>
        <ArrowUpRight class="go h-4 w-4" />
      </a>
      <div class="integration soon">
        <span class="module-icon"><Bot class="h-[18px] w-[18px]" /></span>
        <span class="integration-body">
          <strong>GitOps Bot</strong>
          <span>{$_('projectSettings.overview.gitopsBotDescription')}</span>
        </span>
        <span class="pill pill-soon"><span class="dot"></span>{$_('common.comingSoon')}</span>
      </div>
    </div>
  </section>

  <!-- Danger zone -->
  {#if canUpdate || data.canDelete}
    <section class="section">
      <header class="section-head">
        <div>
          <h2>{$_('projectSettings.overview.dangerZone')}</h2>
          <p>{$_('projectSettings.global.dangerDescription')}</p>
        </div>
      </header>
      <div class="card danger">
        {#if canUpdate}
          <div class="danger-row">
            <div>
              <strong>{$_('projectSettings.overview.transferToOrganization')}</strong>
              <p>{$_('projectSettings.overview.transferDescription')}</p>
            </div>
            <button
              type="button"
              class="ghost"
              disabled
              title={$_('projectSettings.overview.transferSoon')}
            >
              <Building2 class="h-3.5 w-3.5" />
              {$_('projectSettings.overview.transfer')}
            </button>
          </div>
          <div class="danger-row">
            <div>
              <strong>
                {isArchived
                  ? $_('projectSettings.overview.activateProject')
                  : $_('projectSettings.overview.archiveProject')}
              </strong>
              <p>
                {isArchived
                  ? $_('projectSettings.overview.activateDescription')
                  : $_('projectSettings.overview.archiveDescription')}
              </p>
            </div>
            <button type="button" class="ghost" onclick={() => (modal = 'archive')}>
              {#if isArchived}<ArchiveRestore class="h-3.5 w-3.5" />{:else}<Archive
                  class="h-3.5 w-3.5"
                />{/if}
              {isArchived
                ? $_('projectSettings.overview.activate')
                : $_('projectSettings.overview.archive')}
            </button>
          </div>
        {/if}
        {#if data.canDelete}
          <div class="danger-row">
            <div>
              <strong>{$_('projectSettings.overview.deleteProject')}</strong>
              <p>{$_('projectSettings.global.deleteDescription')}</p>
            </div>
            <button type="button" class="danger-button" onclick={() => (modal = 'delete')}>
              <Trash2 class="h-3.5 w-3.5" />
              {$_('common.delete')}
            </button>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

{#if modal}
  <div class="modal-layer">
    <button type="button" class="backdrop" aria-label={$_('common.cancel')} onclick={closeModal}
    ></button>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button
        type="button"
        class="modal-close"
        aria-label={$_('common.cancel')}
        onclick={closeModal}
      >
        <X class="h-4 w-4" />
      </button>

      {#if modal === 'archive'}
        <form method="POST" action="?/updateProjectStatus" use:enhance={confirmArchive}>
          <input type="hidden" name="id" value={project.id} />
          <input type="hidden" name="status" value={isArchived ? 'active' : 'inactive'} />
          <h2 id="modal-title">
            {isArchived
              ? $_('projectSettings.overview.activateProjectModal')
              : $_('projectSettings.overview.archiveProjectModal')}
          </h2>
          <p>
            {isArchived
              ? `${$_('projectSettings.overview.activateConfirmationStart')} «${project.name}»${$_('projectSettings.overview.activateConfirmationEnd')}`
              : `${$_('projectSettings.overview.archiveConfirmationStart')} «${project.name}»${$_('projectSettings.overview.archiveConfirmationEnd')}`}
          </p>
          <div class="modal-actions">
            <button type="button" class="ghost" onclick={closeModal}>{$_('common.cancel')}</button>
            <button type="submit" class="primary" disabled={modalBusy}>
              {modalBusy
                ? isArchived
                  ? $_('projectSettings.overview.activating')
                  : $_('projectSettings.overview.archiving')
                : isArchived
                  ? $_('projectSettings.overview.activate')
                  : $_('projectSettings.overview.archive')}
            </button>
          </div>
        </form>
      {:else}
        <form method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
          <input type="hidden" name="id" value={project.id} />
          <h2 id="modal-title">{$_('projectSettings.overview.deleteProject')}</h2>
          <p>
            {$_('projectSettings.overview.deleteConfirmationStart')} «{project.name}»{$_(
              'projectSettings.overview.deleteConfirmationEnd',
            )}
          </p>
          <label class="confirm-label" for="delete-confirmation">
            {$_('projectSettings.global.deleteConfirmLabel', { values: { slug: project.slug } })}
          </label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="delete-confirmation"
            class="control"
            bind:value={deleteConfirmation}
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
          <div class="modal-actions">
            <button type="button" class="ghost" onclick={closeModal}>{$_('common.cancel')}</button>
            <button
              type="submit"
              class="danger-button solid"
              disabled={modalBusy || deleteConfirmation !== project.slug}
            >
              {modalBusy
                ? $_('projectSettings.overview.deleting')
                : $_('projectSettings.overview.deleteProject')}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<style>
  .global,
  .stack {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .section-head h2 {
    color: #ece8ee;
    font-size: 16px;
    font-weight: 560;
  }

  .section-head p {
    margin-top: 3px;
    color: #8a858d;
    font-size: 13px;
  }

  .card {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.02);
  }

  /* Label on the left, control on the right (Linear-like settings rows) */
  .row {
    display: grid;
    grid-template-columns: minmax(200px, 0.8fr) minmax(0, 1.4fr);
    gap: 24px;
    padding: 18px 20px;
  }

  .row + .row {
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  @media (max-width: 760px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
  }

  .row-label label {
    color: #ded9df;
    font-size: 13.5px;
    font-weight: 540;
  }

  .row-label p {
    margin-top: 3px;
    color: #77737a;
    font-size: 12.5px;
    line-height: 1.45;
  }

  /* app.css paints every input/textarea navy with !important: these win on specificity */
  .global .control,
  .modal .control {
    width: 100%;
    min-height: 38px;
    padding: 8px 12px;
    border: 1px solid rgb(255 255 255 / 0.09) !important;
    border-radius: 8px;
    background-color: rgb(255 255 255 / 0.025) !important;
    color: #ece8ee !important;
    font-size: 13.5px;
    outline: none;
    resize: vertical;
  }

  .global .control:focus,
  .modal .control:focus {
    border-color: rgb(249 93 17 / 0.42) !important;
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .global .control::placeholder {
    color: #6d6870 !important;
  }

  .value {
    padding: 9px 0;
    color: #ded9df;
    font-size: 13.5px;
    white-space: pre-wrap;
  }

  .value.muted {
    color: #6d6870;
    font-style: italic;
  }

  .slug {
    display: flex;
    height: 38px;
    align-items: center;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    background: rgb(255 255 255 / 0.025);
  }

  .slug:focus-within {
    border-color: rgb(249 93 17 / 0.42);
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .slug-prefix {
    flex-shrink: 0;
    height: 100%;
    padding: 0 10px;
    border-right: 1px solid rgb(255 255 255 / 0.07);
    background: rgb(255 255 255 / 0.03);
    color: #6d6870;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 36px;
  }

  .global .slug-input {
    min-width: 0;
    flex: 1;
    padding: 0 10px;
    border: 0 !important;
    background-color: transparent !important;
    color: #ece8ee !important;
    font-family: var(--font-mono);
    font-size: 13px;
    outline: none;
  }

  .slug-input.readonly {
    line-height: 36px;
  }

  .slug-copy {
    display: grid;
    width: 36px;
    height: 100%;
    flex-shrink: 0;
    place-items: center;
    border-left: 1px solid rgb(255 255 255 / 0.07);
    color: #8a858d;
  }

  .slug-copy:hover {
    background: rgb(255 255 255 / 0.05);
    color: #ece8ee;
  }

  .hint-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    color: #f6c860;
    font-size: 12px;
  }

  /* Pills */
  .pill {
    display: inline-flex;
    height: 22px;
    flex-shrink: 0;
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

  .pill-on {
    border-color: rgb(74 222 128 / 0.2);
    background: rgb(74 222 128 / 0.08);
    color: #6ee7a0;
  }

  .pill-warning,
  .pill-soon {
    border-color: rgb(251 191 36 / 0.2);
    background: rgb(251 191 36 / 0.07);
    color: #f6c860;
  }

  /* Modules */
  .modules {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 900px) {
    .modules {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .module {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.02);
    cursor: pointer;
    transition: border-color 120ms ease;
  }

  .module:hover:not(.locked):not(.soon) {
    border-color: rgb(255 255 255 / 0.13);
  }

  .module.on {
    border-color: rgb(249 93 17 / 0.3);
    background: linear-gradient(180deg, rgb(249 93 17 / 0.06), rgb(255 255 255 / 0.015));
  }

  .module.soon,
  .module.locked {
    cursor: default;
  }

  .module.soon {
    opacity: 0.65;
  }

  .module-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .module-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.04);
    color: #d8d3da;
  }

  .module.on .module-icon {
    border-color: rgb(249 93 17 / 0.25);
    background: rgb(249 93 17 / 0.1);
    color: #ff8a4c;
  }

  .module strong {
    color: #ece8ee;
    font-size: 14px;
    font-weight: 560;
  }

  .module-description {
    color: #8a858d;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .module-foot {
    margin-top: auto;
    padding-top: 8px;
    color: #6d6870;
    font-size: 12px;
  }

  .module-foot a {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #ff9a66;
  }

  /* the invisible checkbox covers the card: clicking anywhere toggles it */
  .switch-input {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .switch-input:disabled {
    cursor: default;
  }

  .switch {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.14);
    transition: background 140ms ease;
  }

  .switch::after {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
    content: '';
    transition: transform 140ms ease;
  }

  .module.on .switch {
    background: #f95d11;
  }

  .module.on .switch::after {
    transform: translateX(14px);
  }

  .module:has(.switch-input:focus-visible) {
    outline: 2px solid rgb(249 93 17 / 0.5);
    outline-offset: 2px;
  }

  /* Save bar */
  .savebar {
    position: sticky;
    z-index: 5;
    bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 12px;
    background: rgb(23 24 29 / 0.92);
    backdrop-filter: blur(12px);
    color: #8a858d;
    font-size: 13px;
  }

  .savebar.visible {
    border-color: rgb(249 93 17 / 0.35);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    color: #ece8ee;
  }

  .savebar-actions {
    display: flex;
    gap: 8px;
  }

  /* Buttons */
  .primary,
  .ghost,
  .danger-button {
    display: inline-flex;
    height: 34px;
    flex-shrink: 0;
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
    color: #fff;
  }

  .primary:disabled {
    border-color: rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.06);
    color: #6d6870;
  }

  .ghost {
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
  }

  .ghost:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.08);
  }

  .ghost:disabled {
    opacity: 0.45;
  }

  .danger-button {
    border: 1px solid rgb(248 113 113 / 0.35);
    background: rgb(248 113 113 / 0.08);
    color: #fca5a5;
  }

  .danger-button:hover:not(:disabled) {
    background: rgb(248 113 113 / 0.16);
  }

  .danger-button.solid {
    background: #dc2626;
    color: #fff;
  }

  .danger-button:disabled {
    opacity: 0.45;
  }

  /* Integrations */
  .integrations {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 760px) {
    .integrations {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .integration {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.02);
    color: inherit;
    transition: border-color 120ms ease;
  }

  a.integration:hover {
    border-color: rgb(255 255 255 / 0.14);
  }

  .integration.soon {
    opacity: 0.65;
  }

  .integration-body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .integration-body strong {
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
  }

  .integration-body span {
    color: #8a858d;
    font-size: 12.5px;
  }

  .integration :global(.go) {
    color: #6d6870;
  }

  /* Danger zone */
  .card.danger {
    border-color: rgb(248 113 113 / 0.22);
  }

  .danger-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
  }

  .danger-row + .danger-row {
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .danger-row strong {
    color: #ded9df;
    font-size: 13.5px;
    font-weight: 540;
  }

  .danger-row p {
    margin-top: 3px;
    color: #77737a;
    font-size: 12.5px;
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

  .banner-success {
    border-color: rgb(74 222 128 / 0.22);
    background: rgb(74 222 128 / 0.06);
    color: #a7f3c4;
  }

  .banner-error {
    border-color: rgb(248 113 113 / 0.25);
    background: rgb(248 113 113 / 0.07);
    color: #fca5a5;
  }

  .banner-muted {
    border-color: rgb(255 255 255 / 0.08);
    background: rgb(255 255 255 / 0.025);
    color: #9d98a0;
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
    width: min(440px, 100%);
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

  .modal p {
    margin-top: 8px;
    color: #a9a4ac;
    font-size: 13.5px;
    line-height: 1.5;
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

  .confirm-label {
    display: block;
    margin: 16px 0 6px;
    color: #a9a4ac;
    font-size: 12.5px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
</style>
