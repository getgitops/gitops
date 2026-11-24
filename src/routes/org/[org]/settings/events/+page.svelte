<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    Activity,
    BarChart3,
    Bot,
    Building2,
    CheckCircle2,
    ChevronRight,
    Clock,
    Filter,
    FolderKanban,
    LoaderCircle,
    Shield,
    User,
    Users,
  } from '@lucide/svelte';
  import { Drawer, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';
  import type { EventStatusFilter, EventView } from './event-view';

  let {
    data,
  }: {
    data: {
      orgSlug: string;
      events: EventView[];
      filters: { module: string | null; status: EventStatusFilter };
      canAck: boolean;
      modules: readonly string[];
      retentionMs: number;
    };
  } = $props();

  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  const retention = $derived(
    data.retentionMs % DAY === 0
      ? $_('org.events.retentionDays', { values: { count: data.retentionMs / DAY } })
      : data.retentionMs % HOUR === 0
        ? $_('org.events.retentionHours', { values: { count: data.retentionMs / HOUR } })
        : $_('org.events.retentionMinutes', {
            values: { count: Math.max(1, Math.round(data.retentionMs / 60_000)) },
          }),
  );

  const pendingCount = $derived(data.events.filter((event) => !event.ack).length);

  const moduleIcons: Record<string, typeof Activity> = {
    code_report: BarChart3,
    vault: Shield,
    projects: FolderKanban,
    organization: Building2,
    access: Users,
    monitoring: Activity,
  };

  const statusTabs = $derived([
    { value: 'all', label: $_('org.events.statusAll') },
    { value: 'pending', label: $_('org.events.statusPending') },
    { value: 'acked', label: $_('org.events.statusAcked') },
  ]);

  function statusHref(status: string) {
    const params = new URLSearchParams();
    if (data.filters.module) params.set('module', data.filters.module);
    if (status !== 'all') params.set('status', status);
    const query = params.toString();
    return query ? `?${query}` : '?';
  }

  // agrupados por día (los eventos llegan del más reciente al más antiguo)
  function dayKey(value: string) {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function dayLabel(value: string) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(value) === dayKey(today.toISOString())) return $_('auditLog.today');
    if (dayKey(value) === dayKey(yesterday.toISOString())) return $_('org.events.yesterday');
    return date.toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const groups = $derived.by(() => {
    const result: { key: string; label: string; events: EventView[] }[] = [];
    for (const event of data.events) {
      const key = dayKey(event.occurredAt);
      const last = result.at(-1);
      if (last?.key === key) last.events.push(event);
      else result.push({ key, label: dayLabel(event.occurredAt), events: [event] });
    }
    return result;
  });

  function formatTime(value: string) {
    return new Date(value).toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString($locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function actorName(event: EventView) {
    if (event.actor.kind === 'system') return $_('org.events.actorSystem');
    if (event.actor.kind === 'api_key') {
      return event.actor.name
        ? $_('org.events.actorApiKey', { values: { name: event.actor.name } })
        : $_('org.events.actorApiKeyUnknown');
    }
    return event.actor.name ?? '—';
  }

  function submitFilters(changeEvent: Event) {
    (changeEvent.currentTarget as HTMLSelectElement).form?.requestSubmit();
  }

  // detalle: se busca por id para que refleje el estado tras marcarlo como revisado
  let selectedId = $state<string | null>(null);
  let detailOpen = $state(false);
  const selected = $derived(data.events.find((event) => event.id === selectedId) ?? null);

  function openDetail(event: EventView) {
    selectedId = event.id;
    detailOpen = true;
  }

  let acking = $state<string | null>(null);

  const ackEvent =
    (eventId: string): SubmitFunction =>
    () => {
      acking = eventId;
      return async ({ result, update }) => {
        await update({ reset: false });
        acking = null;
        if (result.type === 'failure' || result.type === 'error') {
          toast.error(
            result.type === 'failure' && result.data?.error
              ? String(result.data.error)
              : $_('org.events.ackFailed'),
          );
        }
      };
    };
</script>

<svelte:head>
  <title>{$_('org.events.title')} - GitOps</title>
</svelte:head>

{#snippet ackForm(event: EventView, full: boolean)}
  <form
    method="POST"
    action="?/ack"
    use:enhance={ackEvent(event.id)}
    class={full ? 'flex-1' : 'relative z-10'}
  >
    <input type="hidden" name="eventId" value={event.id} />
    <button
      type="submit"
      disabled={acking === event.id}
      class="k-btn {full ? 'k-btn-primary w-full' : 'k-btn-secondary k-btn-sm'}"
    >
      {#if acking === event.id}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<CheckCircle2
          class="h-3.5 w-3.5"
        />{/if}
      {$_('org.events.ack')}
    </button>
  </form>
{/snippet}

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('org.events.title')}</h1>
      <p class="mt-1 max-w-2xl text-sm text-fg-muted">{$_('org.events.description')}</p>
    </div>
    <span class="k-badge {pendingCount > 0 ? 'k-badge-warn' : 'k-badge-ok'}">
      {#if pendingCount > 0}
        <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
      {:else}
        <CheckCircle2 class="h-3.5 w-3.5" />
      {/if}
      {$_('org.events.pendingCount', { values: { count: pendingCount } })}
    </span>
  </header>

  <div class="k-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <nav
        class="inline-flex rounded-lg border border-white/8 bg-white/2 p-0.5"
        aria-label={$_('org.events.filterStatus')}
      >
        {#each statusTabs as tab (tab.value)}
          <a
            href={statusHref(tab.value)}
            aria-current={data.filters.status === tab.value ? 'page' : undefined}
            class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {data.filters
              .status === tab.value
              ? 'bg-white/8 text-white'
              : 'text-fg-muted hover:text-white'}">{tab.label}</a
          >
        {/each}
      </nav>
      <form method="GET" class="flex items-center gap-2">
        {#if data.filters.status !== 'all'}
          <input type="hidden" name="status" value={data.filters.status} />
        {/if}
        <select
          name="module"
          class="k-input h-9 w-auto"
          aria-label={$_('org.events.filterModule')}
          value={data.filters.module ?? ''}
          onchange={submitFilters}
        >
          <option value="">{$_('org.events.allModules')}</option>
          {#each data.modules as module (module)}
            <option value={module}>{$_(`org.events.modules.${module}`)}</option>
          {/each}
        </select>
        <noscript>
          <button type="submit" class="k-btn k-btn-secondary k-btn-sm h-9">
            <Filter class="h-3.5 w-3.5" />{$_('org.events.applyFilters')}
          </button>
        </noscript>
      </form>
      <p class="flex items-center gap-1.5 text-xs text-fg-subtle sm:ml-auto">
        <Clock class="h-3.5 w-3.5" />
        {$_('org.events.retentionNotice', { values: { retention } })}
      </p>
    </div>

    {#if data.events.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
          <Activity class="h-6 w-6" />
        </span>
        <p class="text-sm font-medium text-white">{$_('org.events.emptyTitle')}</p>
        <p class="max-w-sm text-sm text-fg-muted">{$_('org.events.emptyDescription')}</p>
      </div>
    {:else}
      {#each groups as group (group.key)}
        <h2
          class="border-b border-white/5 bg-white/2 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle first-letter:uppercase"
        >
          {group.label}
        </h2>
        <ul class="divide-y divide-white/5">
          {#each group.events as event (event.id)}
            {@const Icon = moduleIcons[event.module] ?? Activity}
            <li
              class="group relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/2.5 {selectedId ===
                event.id && detailOpen
                ? 'bg-white/3'
                : ''}"
            >
              <span
                class="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg {event.ack
                  ? 'bg-white/5 text-fg-subtle'
                  : 'bg-brand-500/12 text-brand-400'}"
              >
                <Icon class="h-4 w-4" />
                {#if !event.ack}
                  <span
                    class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-ink-950"
                    aria-hidden="true"
                  ></span>
                {/if}
              </span>
              <div class="min-w-0 flex-1">
                <button
                  type="button"
                  class="block max-w-full truncate text-left text-sm font-medium text-white outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  onclick={() => openDetail(event)}
                >
                  {$_(event.label)}
                </button>
                <p class="mt-0.5 truncate text-xs text-fg-subtle">
                  {$_(`org.events.modules.${event.module}`)} · {actorName(event)}
                  {#if event.project}
                    · {$_('org.events.inProject', {
                      values: { name: event.project.name ?? event.project.id },
                    })}
                  {/if}
                </p>
              </div>
              <div class="hidden shrink-0 items-center gap-3 sm:flex">
                {#if event.ack}
                  <span
                    class="k-badge k-badge-ok h-6 gap-1 px-2 text-[11px]"
                    title={formatDate(event.ack.at)}
                  >
                    <CheckCircle2 class="h-3 w-3" />{$_('org.events.ackedByShort', {
                      values: { name: event.ack.username },
                    })}
                  </span>
                {:else if data.canAck}
                  {@render ackForm(event, false)}
                {/if}
                <time
                  datetime={event.occurredAt}
                  class="w-12 text-right font-mono text-xs tabular-nums text-fg-subtle"
                  >{formatTime(event.occurredAt)}</time
                >
                <ChevronRight class="h-4 w-4 text-fg-subtle group-hover:text-white" />
              </div>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </div>
</div>

<Drawer
  bind:open={detailOpen}
  size="md"
  title={selected ? $_(selected.label) : $_('org.events.title')}
  description={selected ? formatDate(selected.occurredAt) : undefined}
>
  {#if selected}
    {@const Icon = moduleIcons[selected.module] ?? Activity}
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="k-badge h-6 gap-1 px-2 text-[11px]">
          <Icon class="h-3 w-3" />{$_(`org.events.modules.${selected.module}`)}
        </span>
        {#if selected.ack}
          <span class="k-badge k-badge-ok h-6 gap-1 px-2 text-[11px]">
            <CheckCircle2 class="h-3 w-3" />{$_('org.events.acked')}
          </span>
        {:else}
          <span class="k-badge k-badge-warn h-6 gap-1 px-2 text-[11px]">
            <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>{$_('org.events.pending')}
          </span>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-white/8 bg-white/2 p-3">
          <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
            {#if selected.actor.kind === 'user'}<User class="h-3.5 w-3.5" />{:else}<Bot
                class="h-3.5 w-3.5"
              />{/if}
            {$_('org.events.actor')}
          </p>
          <p class="mt-1 truncate text-sm font-medium text-white">{actorName(selected)}</p>
        </div>
        <div class="rounded-xl border border-white/8 bg-white/2 p-3">
          <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <FolderKanban class="h-3.5 w-3.5" />{$_('org.events.scope')}
          </p>
          <p class="mt-1 truncate text-sm font-medium text-white">
            {selected.project
              ? (selected.project.name ?? selected.project.id)
              : $_('org.events.modules.organization')}
          </p>
        </div>
      </div>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
          {$_('org.events.fieldsTitle')}
        </p>
        {#if selected.fields.length > 0}
          <dl class="divide-y divide-white/6 rounded-xl border border-white/8">
            {#each selected.fields as field (field.label)}
              <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2.5 text-sm">
                <dt class="text-fg-subtle">{$_(field.label)}</dt>
                <dd class="break-all text-white">
                  {field.translate ? $_(field.value) : field.value}
                </dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="text-sm text-fg-subtle">{$_('org.events.noFields')}</p>
        {/if}
      </div>

      <div class="rounded-xl border border-white/8 bg-white/2 p-3 text-xs text-fg-subtle">
        <p class="font-mono text-[11px] text-fg-muted">{selected.type}</p>
        {#if selected.ack}
          <p class="mt-1.5">
            {$_('org.events.ackedBy', {
              values: { name: selected.ack.username, date: formatDate(selected.ack.at) },
            })}
          </p>
        {/if}
      </div>
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary flex-1" onclick={() => (detailOpen = false)}
      >{$_('common.close')}</button
    >
    {#if selected && !selected.ack && data.canAck}
      {@render ackForm(selected, true)}
    {/if}
  {/snippet}
</Drawer>
