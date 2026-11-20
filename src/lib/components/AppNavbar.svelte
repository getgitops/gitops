<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Bell,
    Check,
    ChevronDown,
    CircleCheck,
    FolderKanban,
    Search,
    ShieldAlert,
    TriangleAlert,
    X,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

  export let projects: { id: string; name: string; slug: string }[] = [];
  export let organizationSlug: string | null = 'gitops';
  export let projectSlug = '';
  export let compact = false;

  let showProjectDropdown = false;
  let showNotifications = false;
  let projectMenuRef: HTMLDivElement | undefined;
  let notificationsButtonRef: HTMLButtonElement | undefined;

  type NotificationItem = {
    id: string;
    type: 'critical' | 'success' | 'info';
    title: string;
    detail: string;
    context: string;
    time: string;
    unread: boolean;
    href?: string;
  };

  let notifications: NotificationItem[] = [
    {
      id: 'mock-service-x-critical',
      type: 'critical',
      title: 'Vulnerabilidades críticas en Servicio X',
      detail:
        'Se han detectado 3 vulnerabilidades críticas en las últimas dependencias analizadas.',
      context: 'Servicio X · Code Report',
      time: 'Hace 4 min',
      unread: true,
      href: projectSlug
        ? `/org/${organizationSlug}/projects/${projectSlug}/code-report/dashboard`
        : undefined,
    },
    {
      id: 'mock-scan-complete',
      type: 'success',
      title: 'Análisis de seguridad completado',
      detail: 'El último escaneo ha finalizado correctamente.',
      context: 'Code Report · main',
      time: 'Hace 22 min',
      unread: true,
    },
    {
      id: 'mock-sync-complete',
      type: 'info',
      title: 'GitDB sincronizado',
      detail: 'Los cambios más recientes ya están disponibles.',
      context: 'Sistema',
      time: 'Hace 1 h',
      unread: false,
    },
  ];

  $: currentProject = projects.find((project) => project.slug === projectSlug) ?? null;
  $: unreadCount = notifications.filter((notification) => notification.unread).length;
  function handleWindowClick(event: MouseEvent) {
    const target = event.target as Node;

    if (showProjectDropdown && projectMenuRef && !projectMenuRef.contains(target)) {
      showProjectDropdown = false;
    }

    if (
      showNotifications &&
      notificationsButtonRef &&
      !notificationsButtonRef.contains(target) &&
      target instanceof Element &&
      !target.closest('.notifications-popover')
    ) {
      showNotifications = false;
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function markAllAsRead() {
    notifications = notifications.map((notification) => ({ ...notification, unread: false }));
  }

  function markAsRead(id: string) {
    notifications = notifications.map((notification) =>
      notification.id === id ? { ...notification, unread: false } : notification,
    );
  }

  function handleNotificationKey(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      markAsRead(id);
    }
  }

  function receiveNotification(event: Event) {
    const payload = (event as CustomEvent<NotificationItem>).detail;
    if (!payload?.id || !payload?.title) return;

    notifications = [{ ...payload, unread: payload.unread ?? true }, ...notifications].slice(0, 12);
  }

  onMount(() => {
    window.addEventListener('gitops:notification', receiveNotification);
    return () => window.removeEventListener('gitops:notification', receiveNotification);
  });
</script>

<svelte:window on:click={handleWindowClick} />

<header class="app-topbar">
  <a href="/" class="app-brand" class:compact aria-label="GitOps home">
    <span class="brand-mark" aria-hidden="true">
      <span></span>
    </span>
    {#if !compact}
      <span class="brand-name">Get<span>GitOps</span></span>
    {/if}
  </a>

  <div class="topbar-content">
    {#if currentProject}
      <div class="relative" bind:this={projectMenuRef}>
        <button
          type="button"
          class="topbar-context"
          on:click={() => (showProjectDropdown = !showProjectDropdown)}
          aria-expanded={showProjectDropdown}
        >
          <span class="context-avatar">
            <FolderKanban class="h-4 w-4" />
          </span>
          <span class="topbar-project-label">
            <small>Project</small>
            <strong>{currentProject.name}</strong>
          </span>
          <ChevronDown class="h-3.5 w-3.5 text-[#777b86]" />
        </button>

        {#if showProjectDropdown}
          <div class="topbar-menu left-0">
            {#each projects as project (project.id)}
              <a
                href={`/org/${organizationSlug}/projects/${project.slug}/overview`}
                class:active={project.id === currentProject.id}
                on:click={() => (showProjectDropdown = false)}
              >
                {project.name}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div aria-hidden="true"></div>
    {/if}

    <label class="topbar-search">
      <Search class="h-3.5 w-3.5" />
      <input type="search" placeholder="Search..." aria-label="Search" />
      <kbd>⌘K</kbd>
    </label>

    <div class="topbar-actions">
      <button
        class="notification-button"
        class:active={showNotifications}
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={showNotifications}
        on:click={() => (showNotifications = !showNotifications)}
        bind:this={notificationsButtonRef}
      >
        <Bell class="h-4 w-4" />
        {#if unreadCount > 0}<span></span>{/if}
      </button>
    </div>
  </div>
</header>

{#if showNotifications}
  <section class="notifications-popover" aria-label="Notifications" use:portal>
    <header>
      <div>
        <h2>Notificaciones</h2>
        <p>{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}</p>
      </div>
      <div class="notifications-header-actions">
        {#if unreadCount > 0}
          <button type="button" on:click={markAllAsRead}>
            <Check class="h-4 w-4" />
            Marcar todo
          </button>
        {/if}
        <button
          type="button"
          class="notification-close"
          aria-label="Cerrar notificaciones"
          on:click={() => (showNotifications = false)}
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <div class="notifications-list">
      {#each notifications as notification (notification.id)}
        <svelte:element
          this={notification.href ? 'a' : 'article'}
          href={notification.href}
          class="notification-item"
          class:unread={notification.unread}
          role={notification.href ? 'link' : 'button'}
          tabindex="0"
          on:click={() => markAsRead(notification.id)}
          on:keydown={(event: KeyboardEvent) => handleNotificationKey(event, notification.id)}
        >
          <span class={`notification-icon ${notification.type}`}>
            {#if notification.type === 'critical'}
              <ShieldAlert class="h-5 w-5" />
            {:else if notification.type === 'success'}
              <CircleCheck class="h-5 w-5" />
            {:else}
              <TriangleAlert class="h-5 w-5" />
            {/if}
          </span>
          <span class="notification-content">
            <span class="notification-title">
              <strong>{notification.title}</strong>
              {#if notification.unread}<i></i>{/if}
            </span>
            <span class="notification-detail">{notification.detail}</span>
            <span class="notification-meta">
              <span>{notification.context}</span>
              <span>·</span>
              <time>{notification.time}</time>
            </span>
          </span>
        </svelte:element>
      {/each}
    </div>

    <footer>
      <a
        href={organizationSlug ? `/org/${organizationSlug}/settings/alerts` : '/org'}
        on:click={() => (showNotifications = false)}
      >
        Gestionar alertas
      </a>
      <span>El contenido marcado se sincroniza cuando llegue desde SSE</span>
    </footer>
  </section>
{/if}
