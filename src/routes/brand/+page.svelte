<script lang="ts">
  import {
    Activity,
    ArrowRight,
    Bell,
    Boxes,
    Building,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    CircleCheck,
    CircleX,
    Copy,
    Database,
    Download,
    Ellipsis,
    ExternalLink,
    FolderGit2,
    Funnel,
    GitBranch,
    GitCommitHorizontal,
    Info,
    KeyRound,
    LayoutDashboard,
    LoaderCircle,
    LockKeyhole,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Plus,
    Rocket,
    Search,
    Server,
    Settings,
    ShieldCheck,
    Trash,
    TriangleAlert,
    User,
    Users,
    X,
  } from '@lucide/svelte';
  import {
    AppWindow,
    Sparkles,
    BellOff,
    CheckCheck,
    Clock,
    Command,
    Eye,
    EyeOff,
    GitPullRequest,
    MessageSquareText,
    PanelRight,
    UserPlus,
  } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import BrandCharts from './BrandCharts.svelte';
  import CommandPalette, { type CommandGroup } from './CommandPalette.svelte';

  const sections = [
    { id: 'logo', label: 'Logo', icon: Sparkles },
    { id: 'paleta', label: 'Paleta', icon: LayoutDashboard },
    { id: 'tipografia', label: 'Tipografía', icon: Pencil },
    { id: 'botones', label: 'Botones', icon: Rocket },
    { id: 'badges', label: 'Badges y estados', icon: ShieldCheck },
    { id: 'formularios', label: 'Formularios', icon: KeyRound },
    { id: 'dropdowns', label: 'Dropdowns', icon: ChevronsUpDown },
    { id: 'cards', label: 'Cards', icon: Boxes },
    { id: 'tablas', label: 'Tablas', icon: Database },
    { id: 'navegacion', label: 'Navegación', icon: GitBranch },
    { id: 'feedback', label: 'Feedback', icon: Bell },
    { id: 'modales', label: 'Modales', icon: AppWindow },
    { id: 'graficas', label: 'Gráficas', icon: Activity },
    { id: 'sidebar', label: 'Sidebar', icon: PanelLeftClose },
  ];

  const brandScale = [
    ['50', '#fff4ec'],
    ['100', '#ffe6d4'],
    ['200', '#ffc9a8'],
    ['300', '#ffa470'],
    ['400', '#ff7a38'],
    ['500', '#f95d11'],
    ['600', '#e14607'],
    ['700', '#ba3208'],
    ['800', '#94290e'],
    ['900', '#78240f'],
  ];
  const inkScale = [
    ['950', '#0a0a0d', 'Fondo'],
    ['900', '#101014', 'Panel'],
    ['800', '#17171d', 'Popover'],
    ['700', '#212129', 'Hover'],
    ['600', '#2c2c36', 'Borde fuerte'],
    ['500', '#3a3a46', 'Deshabilitado'],
  ];
  const textTokens = [
    ['fg', '#e7e7ea', 'Texto principal'],
    ['fg-muted', '#a9a9b3', 'Secundario'],
    ['fg-subtle', '#72727e', 'Terciario / ayudas'],
  ];
  const statusTokens = [
    ['ok', '#22c55e', 'Operativo', CircleCheck],
    ['warn', '#f59e0b', 'Aviso', TriangleAlert],
    ['danger', '#ef4444', 'Error', CircleX],
    ['info', '#60a5fa', 'Info', Info],
  ] as const;
  const seriesTokens = ['#e14607', '#3b82f6', '#0d9488', '#a855f7', '#b8860b'];

  // ---------- Estado de demos ----------
  let copied = $state<string | null>(null);
  function copy(hex: string) {
    navigator.clipboard?.writeText(hex);
    copied = hex;
    setTimeout(() => (copied = null), 1200);
  }

  let loading = $state(false);
  function fakeLoad() {
    loading = true;
    setTimeout(() => (loading = false), 1500);
  }

  let toggles = $state({ sso: true, registro: false, monitoring: true });
  let entorno = $state('prod');
  let tab = $state('resumen');
  let periodo = $state('24h');
  let page = $state(2);
  let toastVisible = $state(false);
  let toastText = $state({
    title: 'Secreto guardado',
    body: 'DATABASE_URL · prod · commit a1b2c3d',
  });
  let collapsed = $state(false);

  function showToast(title: string, body: string) {
    toastText = { title, body };
    toastVisible = true;
    setTimeout(() => (toastVisible = false), 3000);
  }

  // ---------- Modales ----------
  type ModalId = 'confirm' | 'form' | 'detalle' | 'drawer' | null;
  let modal = $state<ModalId>(null);
  let paletteOpen = $state(false);

  let confirmText = $state('');
  let secretName = $state('');
  let secretValue = $state('');
  let secretEnv = $state('prod');
  let secretVisible = $state(false);
  let secretNameInvalid = $derived(secretName.length > 0 && !/^[A-Z][A-Z0-9_]*$/.test(secretName));
  let detalleTab = $state('descripcion');

  function openModal(id: Exclude<ModalId, null>) {
    openDropdown = null;
    confirmText = '';
    secretName = '';
    secretValue = '';
    secretVisible = false;
    detalleTab = 'descripcion';
    modal = id;
  }

  function saveSecret(e: SubmitEvent) {
    e.preventDefault();
    if (!secretName || secretNameInvalid) return;
    modal = null;
    showToast('Secreto guardado', `${secretName} · ${secretEnv} · commit 9f2e41b`);
  }

  function autofocus(node: HTMLElement) {
    node.focus();
  }

  // Bloquea el scroll del fondo mientras hay un modal abierto
  $effect(() => {
    if (!modal && !paletteOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  });

  // ---------- Notificaciones ----------
  type Notificacion = {
    id: number;
    icon: typeof Bell;
    tone: 'danger' | 'ok' | 'warn' | 'brand' | 'neutral';
    title: string;
    body: string;
    time: string;
    unread: boolean;
  };
  let notificaciones = $state<Notificacion[]>([
    {
      id: 1,
      icon: CircleX,
      tone: 'danger',
      title: 'checkout-api está caído',
      body: 'El monitor HTTP falló 3 checks seguidos (503).',
      time: 'hace 2 min',
      unread: true,
    },
    {
      id: 2,
      icon: ShieldCheck,
      tone: 'warn',
      title: '2 vulnerabilidades críticas',
      body: 'Open Report en billing-worker · lodash 4.17.20',
      time: 'hace 25 min',
      unread: true,
    },
    {
      id: 3,
      icon: UserPlus,
      tone: 'brand',
      title: 'Ana Martín se ha unido',
      body: 'Aceptó la invitación a Kettu Studio como Developer.',
      time: 'hace 1 h',
      unread: true,
    },
    {
      id: 4,
      icon: CircleCheck,
      tone: 'ok',
      title: 'Despliegue completado',
      body: 'gitops-cloud · main · a1b2c3d',
      time: 'hace 3 h',
      unread: false,
    },
    {
      id: 5,
      icon: GitPullRequest,
      tone: 'neutral',
      title: 'Stack prod actualizado',
      body: 'Pulumi aplicó 4 cambios en state IaC.',
      time: 'ayer',
      unread: false,
    },
  ]);
  let notifTab = $state<'todas' | 'no-leidas'>('todas');
  let unreadCount = $derived(notificaciones.filter((n) => n.unread).length);
  let notifVisibles = $derived(
    notifTab === 'todas' ? notificaciones : notificaciones.filter((n) => n.unread),
  );
  const toneClass = {
    danger: 'bg-red-500/10 text-red-400',
    ok: 'bg-green-500/10 text-green-400',
    warn: 'bg-amber-500/10 text-amber-400',
    brand: 'bg-brand-500/10 text-brand-400',
    neutral: 'bg-white/5 text-fg-muted',
  } as const;

  // Dropdowns
  type DropdownId = 'select' | 'menu' | 'switcher' | 'user' | 'filtro' | 'notif' | null;
  let openDropdown = $state<DropdownId>(null);
  function toggleDropdown(id: Exclude<DropdownId, null>) {
    openDropdown = openDropdown === id ? null : id;
  }
  function onWindowClick(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('[data-dropdown]')) openDropdown = null;
  }
  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openDropdown = null;
      modal = null;
      paletteOpen = !paletteOpen;
      return;
    }
    if (e.key === 'Escape' && !paletteOpen) {
      openDropdown = null;
      modal = null;
    }
  }

  const regiones = [
    { id: 'europe-west1', name: 'europe-west1', hint: 'Bélgica' },
    { id: 'europe-southwest1', name: 'europe-southwest1', hint: 'Madrid' },
    { id: 'us-central1', name: 'us-central1', hint: 'Iowa' },
    { id: 'asia-northeast1', name: 'asia-northeast1', hint: 'Tokio', disabled: true },
  ];
  let region = $state('europe-southwest1');
  let regionQuery = $state('');
  let regionesFiltradas = $derived(
    regiones.filter((r) => `${r.name} ${r.hint}`.toLowerCase().includes(regionQuery.toLowerCase())),
  );

  const orgs = [
    { slug: 'kettu', name: 'Kettu Studio', projects: ['kettu-web', 'gitops-cloud', 'papers'] },
    { slug: 'remolonas', name: 'Remolonas', projects: ['tienda', 'backoffice'] },
  ];
  let orgActual = $state('kettu');
  let proyectoActual = $state('gitops-cloud');

  let filtros = $state({ critical: true, high: true, medium: false, low: false });

  const servicios = [
    {
      name: 'checkout-api',
      branch: 'main',
      estado: 'ok',
      uptime: '99,98 %',
      p95: '212 ms',
      deploy: 'hace 12 min',
    },
    {
      name: 'auth-service',
      branch: 'main',
      estado: 'ok',
      uptime: '100 %',
      p95: '88 ms',
      deploy: 'hace 2 h',
    },
    {
      name: 'billing-worker',
      branch: 'release/1.4',
      estado: 'warn',
      uptime: '99,41 %',
      p95: '640 ms',
      deploy: 'hace 1 día',
    },
    {
      name: 'legacy-cron',
      branch: 'develop',
      estado: 'danger',
      uptime: '97,10 %',
      p95: '—',
      deploy: 'hace 6 días',
    },
  ] as const;
  const estadoBadge = { ok: 'k-badge-ok', warn: 'k-badge-warn', danger: 'k-badge-danger' } as const;
  const estadoTexto = { ok: 'Operativo', warn: 'Degradado', danger: 'Caído' } as const;
  const estadoDot = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' } as const;

  const banners = [
    {
      icon: Info,
      title: 'Novedades en GitOps 1.4',
      body: 'Ya puedes crear monitores HTTP desde cada proyecto.',
      box: 'border-blue-400/25 bg-blue-400/6',
      iconCls: 'text-blue-300',
    },
    {
      icon: CircleCheck,
      title: 'Análisis completado',
      body: 'Sin vulnerabilidades críticas en checkout-api.',
      box: 'border-green-500/25 bg-green-500/6',
      iconCls: 'text-green-400',
    },
    {
      icon: TriangleAlert,
      title: 'SMTP no configurado',
      body: 'Las alertas no se enviarán por email hasta configurarlo.',
      box: 'border-amber-500/25 bg-amber-500/6',
      iconCls: 'text-amber-400',
    },
    {
      icon: CircleX,
      title: 'Sincronización fallida',
      body: 'GitDB no pudo hacer push: conflicto en organizations.json.',
      box: 'border-red-500/30 bg-red-500/6',
      iconCls: 'text-red-400',
    },
  ];

  let activeSection = $state('paleta');

  // ---------- Paleta de comandos (⌘K) ----------
  function scrollTo(id: string) {
    activeSection = id;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let commandGroups: CommandGroup[] = $derived([
    {
      label: 'Acciones',
      items: [
        {
          id: 'new-secret',
          label: 'Crear secreto',
          hint: 'Vault',
          icon: KeyRound,
          shortcut: ['N'],
          run: () => openModal('form'),
        },
        {
          id: 'analyze',
          label: 'Lanzar análisis de seguridad',
          hint: 'Open Report',
          icon: ShieldCheck,
          run: () => showToast('Análisis en cola', 'gitops-cloud · main'),
        },
        {
          id: 'invite',
          label: 'Invitar a un miembro',
          icon: UserPlus,
          run: () => showToast('Invitación enviada', 'ana@kettu.studio · Developer'),
        },
        {
          id: 'delete',
          label: 'Eliminar proyecto',
          hint: 'gitops-cloud',
          icon: Trash,
          keywords: 'borrar',
          run: () => openModal('confirm'),
        },
      ],
    },
    {
      label: 'Proyectos',
      items: orgs.flatMap((o) =>
        o.projects.map((p) => ({
          id: `project-${p}`,
          label: p,
          hint: o.name,
          icon: FolderGit2,
          run: () => {
            orgActual = o.slug;
            proyectoActual = p;
            showToast('Proyecto cambiado', `${o.name} · ${p}`);
          },
        })),
      ),
    },
    {
      label: 'Ir a sección del brand',
      items: sections.map((s) => ({
        id: `section-${s.id}`,
        label: s.label,
        icon: s.icon,
        run: () => scrollTo(s.id),
      })),
    },
  ]);

  const navProyecto = [
    { label: 'Dashboard', icon: LayoutDashboard, current: true },
    { label: 'Code Report', icon: ShieldCheck, badge: '3' },
    { label: 'Vault', icon: LockKeyhole },
    { label: 'State IaC', icon: Server },
    { label: 'Monitoring', icon: Activity },
  ];
  const navOrg = [
    { label: 'Proyectos', icon: FolderGit2 },
    { label: 'Usuarios', icon: Users },
    { label: 'Ajustes', icon: Settings },
  ];
</script>

<svelte:head>
  <title>Brand · GitOps</title>
  <meta name="robots" content="noindex" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

{#snippet sectionTitle(id: string, title: string, desc: string)}
  <div {id} class="scroll-mt-24">
    <h2 class="text-2xl font-semibold tracking-tight text-white">{title}</h2>
    <p class="mt-1 max-w-2xl text-sm text-fg-muted">{desc}</p>
  </div>
{/snippet}

<div class="brand-root min-h-screen bg-ink-950 font-sans text-fg antialiased">
  <!-- Topbar -->
  <header
    class="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/8 bg-ink-950/80 px-4 backdrop-blur-xl sm:px-6"
  >
    <a href="/" class="flex items-center gap-2.5">
      <img src="/brand/gitops-logo-dark.svg" alt="GitOps" class="h-6 w-auto" />
      <span class="k-badge k-badge-brand hidden sm:inline-flex">brand v3</span>
    </a>

    <div class="mx-auto hidden w-full max-w-md md:block">
      <button
        class="k-input flex h-9 items-center gap-2.5 text-left text-fg-subtle"
        aria-label="Abrir búsqueda"
        onclick={() => (paletteOpen = true)}
      >
        <Search class="h-4 w-4 shrink-0" />
        <span class="flex-1 truncate">Buscar proyectos, secretos, stacks…</span>
        <span class="flex gap-1"><span class="k-kbd">⌘</span><span class="k-kbd">K</span></span>
      </button>
    </div>

    <div class="ml-auto flex items-center gap-1.5 md:ml-0">
      <button
        class="k-btn k-btn-ghost k-btn-icon md:hidden"
        aria-label="Buscar"
        onclick={() => (paletteOpen = true)}
      >
        <Search class="h-4 w-4" />
      </button>
      <div class="relative" data-dropdown>
        <button
          class="k-btn k-btn-ghost k-btn-icon relative {openDropdown === 'notif'
            ? 'bg-white/6 text-white'
            : ''}"
          aria-label="Notificaciones ({unreadCount} sin leer)"
          aria-haspopup="dialog"
          aria-expanded={openDropdown === 'notif'}
          onclick={() => toggleDropdown('notif')}
        >
          <Bell class="h-4 w-4" />
          {#if unreadCount > 0}
            <span
              class="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-ink-950"
              >{unreadCount}</span
            >
          {/if}
        </button>
        {#if openDropdown === 'notif'}
          <div
            class="k-popover fixed inset-x-3 top-17 z-40 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-95"
            role="dialog"
            aria-label="Notificaciones"
            transition:fly={{ y: -6, duration: 140, easing: cubicOut }}
          >
            <div class="flex items-center justify-between px-4 pb-2 pt-3.5">
              <p class="text-sm font-semibold text-white">Notificaciones</p>
              <button
                class="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:cursor-default disabled:text-fg-subtle"
                disabled={unreadCount === 0}
                onclick={() => notificaciones.forEach((n) => (n.unread = false))}
              >
                <CheckCheck class="h-3.5 w-3.5" />Marcar todo como leído
              </button>
            </div>
            <div class="flex gap-4 border-b border-white/8 px-4" role="tablist">
              {#each [['todas', 'Todas'], ['no-leidas', `No leídas · ${unreadCount}`]] as [id, label]}
                <button
                  role="tab"
                  aria-selected={notifTab === id}
                  class="-mb-px border-b-2 pb-2 text-xs font-medium transition-colors {notifTab ===
                  id
                    ? 'border-brand-500 text-white'
                    : 'border-transparent text-fg-subtle hover:text-fg'}"
                  onclick={() => (notifTab = id as typeof notifTab)}>{label}</button
                >
              {/each}
            </div>
            <ul class="max-h-90 divide-y divide-white/5 overflow-y-auto">
              {#each notifVisibles as n (n.id)}
                <li>
                  <button
                    class="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/3 {n.unread
                      ? 'bg-brand-500/3'
                      : ''}"
                    onclick={() => (n.unread = false)}
                  >
                    <span
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-lg {toneClass[
                        n.tone
                      ]}"><n.icon class="h-4 w-4" /></span
                    >
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm {n.unread ? 'font-medium text-white' : 'text-fg'}"
                        >{n.title}</span
                      >
                      <span class="mt-0.5 block text-xs text-fg-muted">{n.body}</span>
                      <span class="mt-1 flex items-center gap-1 text-[11px] text-fg-subtle"
                        ><Clock class="h-3 w-3" />{n.time}</span
                      >
                    </span>
                    {#if n.unread}<span
                        class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                        aria-label="Sin leer"
                      ></span>{/if}
                  </button>
                </li>
              {:else}
                <li class="px-4 py-10 text-center">
                  <BellOff class="mx-auto h-5 w-5 text-fg-subtle" />
                  <p class="mt-2 text-sm text-fg">Estás al día</p>
                  <p class="mt-0.5 text-xs text-fg-subtle">No tienes notificaciones sin leer.</p>
                </li>
              {/each}
            </ul>
            <div
              class="flex items-center justify-between border-t border-white/8 bg-ink-900/60 px-4 py-2.5"
            >
              <a
                href="#modales"
                class="text-xs font-medium text-fg-muted hover:text-white"
                onclick={() => (openDropdown = null)}>Ver todas</a
              >
              <button
                class="k-btn k-btn-ghost k-btn-sm k-btn-icon"
                aria-label="Ajustes de notificaciones"><Settings class="h-3.5 w-3.5" /></button
              >
            </div>
          </div>
        {/if}
      </div>
      <div class="relative" data-dropdown>
        <button
          class="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-white/5"
          aria-haspopup="menu"
          aria-expanded={openDropdown === 'user'}
          onclick={() => toggleDropdown('user')}
        >
          <span
            class="grid h-7 w-7 place-items-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-xs font-semibold text-white"
            >CL</span
          >
          <ChevronDown class="h-3.5 w-3.5 text-fg-subtle" />
        </button>
        {#if openDropdown === 'user'}
          <div class="k-popover absolute right-0 top-full mt-2 w-60 p-1.5" role="menu">
            <div class="px-2.5 py-2">
              <p class="text-sm font-medium text-white">Carlos López</p>
              <p class="text-xs text-fg-subtle">GitOps Admin</p>
            </div>
            <div class="k-divider my-1"></div>
            <button class="k-menu-item" role="menuitem"
              ><User class="h-4 w-4 text-fg-subtle" />Perfil</button
            >
            <button class="k-menu-item" role="menuitem"
              ><Settings class="h-4 w-4 text-fg-subtle" />Ajustes de GitOps</button
            >
            <div class="k-divider my-1"></div>
            <button class="k-menu-item text-red-300" role="menuitem"
              ><LogOut class="h-4 w-4" />Cerrar sesión</button
            >
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="flex">
    <!-- Sidebar de la página (índice del brand) -->
    <aside
      class="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-white/8 px-3 py-6 lg:block"
    >
      <p class="k-nav-heading">Brand</p>
      <nav class="space-y-0.5">
        {#each sections as s}
          <a
            href="#{s.id}"
            class="k-nav-item"
            aria-current={activeSection === s.id ? 'page' : undefined}
            onclick={() => (activeSection = s.id)}
          >
            <s.icon class="h-4 w-4" />
            {s.label}
          </a>
        {/each}
      </nav>
    </aside>

    <main class="min-w-0 flex-1">
      <!-- Hero -->
      <section class="relative overflow-hidden border-b border-white/8">
        <div class="k-hero-glow absolute inset-0"></div>
        <div class="k-bg-grid absolute inset-0"></div>
        <div class="relative mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
          <span class="k-badge k-badge-brand">🦊 Kettu × GitOps · UI v3</span>
          <h1 class="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            <span class="k-text-gradient">Un sistema visual para</span>
            <span class="k-text-gradient-brand">GitOps</span>
          </h1>
          <p class="mt-4 max-w-2xl text-base text-fg-muted sm:text-lg">
            Base del rediseño, heredada de la paleta de kettu.studio: fondo ink, acento naranja
            zorro y tarjetas con borde sutil. Itera aquí antes de llevarlo a las pantallas.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <a href="#botones" class="k-btn k-btn-primary k-btn-lg"
              >Ver componentes <ArrowRight class="h-4 w-4" /></a
            >
            <a href="#graficas" class="k-btn k-btn-secondary k-btn-lg">Gráficas</a>
          </div>
        </div>
      </section>

      <div class="mx-auto max-w-6xl space-y-20 px-4 py-14 sm:px-8">
        <!-- ================= LOGO ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'logo',
            'Logo',
            'La misma idea de siempre, Git y Ops como dos círculos que se solapan, ahora con la paleta Kettu: Git en neutro, Ops en naranja zorro y la intersección en brand-700. Wordmark en Inter Bold, convertido a trazados.',
          )}

          <div class="grid gap-4 md:grid-cols-2">
            <div class="k-card flex flex-col p-6">
              <div class="flex flex-1 items-center justify-center py-10">
                <img
                  src="/brand/gitops-logo-dark.svg"
                  alt="GitOps, versión para fondo oscuro"
                  class="h-16 w-auto"
                />
              </div>
              <div class="flex items-center justify-between border-t border-white/8 pt-4">
                <span class="text-xs text-fg-subtle">Fondo oscuro · uso principal</span>
                <a href="/brand/gitops-logo-dark.svg" download class="k-btn k-btn-ghost k-btn-sm"
                  ><Download class="h-3.5 w-3.5" />SVG</a
                >
              </div>
            </div>
            <div class="flex flex-col rounded-2xl border border-white/10 bg-[#fafafa] p-6">
              <div class="flex flex-1 items-center justify-center py-10">
                <img
                  src="/brand/gitops-logo-light.svg"
                  alt="GitOps, versión para fondo claro"
                  class="h-16 w-auto"
                />
              </div>
              <div class="flex items-center justify-between border-t border-black/8 pt-4">
                <span class="text-xs text-zinc-500">Fondo claro · documentos, emails</span>
                <a
                  href="/brand/gitops-logo-light.svg"
                  download
                  class="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-zinc-700 hover:bg-black/5"
                  ><Download class="h-3.5 w-3.5" />SVG</a
                >
              </div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <div class="k-card p-6">
              <p class="text-sm font-medium text-white">Marca</p>
              <p class="text-xs text-fg-subtle">Cuando no cabe el wordmark</p>
              <div class="mt-6 flex items-end gap-5">
                <img src="/brand/gitops-mark-dark.svg" alt="" class="h-16 w-auto" />
                <img src="/brand/gitops-mark-dark.svg" alt="" class="h-8 w-auto" />
                <img src="/brand/gitops-mark-dark.svg" alt="" class="h-4 w-auto" />
              </div>
              <div class="mt-5 flex gap-2">
                <a
                  href="/brand/gitops-mark-dark.svg"
                  download
                  class="k-btn k-btn-secondary k-btn-sm">Oscuro</a
                >
                <a
                  href="/brand/gitops-mark-light.svg"
                  download
                  class="k-btn k-btn-secondary k-btn-sm">Claro</a
                >
              </div>
            </div>

            <div class="k-card p-6">
              <p class="text-sm font-medium text-white">Icono de app y favicon</p>
              <p class="text-xs text-fg-subtle">512 · 192 · 180 (Apple) · 32</p>
              <div class="mt-6 flex items-end gap-4">
                <img src="/brand/gitops-icon.svg" alt="" class="h-20 w-20" />
                <img src="/brand/gitops-icon.svg" alt="" class="h-12 w-12" />
                <img src="/brand/gitops-icon-32.png" alt="" class="h-8 w-8" />
                <img src="/brand/gitops-icon-32.png" alt="" class="h-4 w-4" />
              </div>
              <div class="mt-5 flex flex-wrap gap-2">
                <a href="/brand/gitops-icon.svg" download class="k-btn k-btn-secondary k-btn-sm"
                  >SVG</a
                >
                <a href="/brand/gitops-icon-512.png" download class="k-btn k-btn-secondary k-btn-sm"
                  >PNG 512</a
                >
              </div>
            </div>

            <div class="k-card p-6">
              <p class="text-sm font-medium text-white">Colores del logo</p>
              <p class="text-xs text-fg-subtle">Solo estos, sin degradados</p>
              <ul class="mt-5 space-y-2.5">
                {#each [['Git (oscuro)', '#e7e7ea', 'fg'], ['Git (claro)', '#0a0a0d', 'ink-950'], ['Ops', '#f95d11', 'brand-500'], ['Intersección', '#ba3208', 'brand-700']] as [label, hex, token]}
                  <li class="flex items-center gap-3">
                    <span class="h-6 w-6 rounded-full ring-1 ring-white/15" style="background:{hex}"
                    ></span>
                    <span class="flex-1 text-sm text-fg">{label}</span>
                    <span class="font-mono text-[11px] text-fg-subtle">{token} · {hex}</span>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="k-card grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <p class="flex items-center gap-1.5 text-sm font-medium text-green-400">
                <CircleCheck class="h-4 w-4" />Sí
              </p>
              <p class="mt-1 text-sm text-fg-muted">
                Margen libre alrededor de, como mínimo, la mitad de un círculo. Tamaño mínimo: 16 px
                para la marca y 80 px para el logo completo.
              </p>
            </div>
            <div>
              <p class="flex items-center gap-1.5 text-sm font-medium text-red-400">
                <CircleX class="h-4 w-4" />No
              </p>
              <p class="mt-1 text-sm text-fg-muted">
                Cambiar los colores, añadir sombras o degradados, girarlo o deformarlo.
              </p>
            </div>
            <div>
              <p class="flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <TriangleAlert class="h-4 w-4" />Ojo
              </p>
              <p class="mt-1 text-sm text-fg-muted">
                Sobre fotos o fondos naranjas, usa el icono de app (con su cuadrado ink), no la
                marca suelta.
              </p>
            </div>
          </div>
        </section>

        <!-- ================= PALETA ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'paleta',
            'Paleta',
            'Pulsa un color para copiar su hex. Las utilidades Tailwind son bg-brand-500, bg-ink-900, text-fg-muted…',
          )}

          <div class="k-card p-5">
            <p class="mb-3 text-sm font-medium text-white">Brand · naranja zorro</p>
            <div class="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {#each brandScale as [step, hex]}
                <button class="group text-left" onclick={() => copy(hex)}>
                  <div
                    class="h-14 rounded-lg ring-1 ring-white/10 transition group-hover:scale-[1.04] {step ===
                    '500'
                      ? 'ring-2 ring-white/60'
                      : ''}"
                    style="background:{hex}"
                  ></div>
                  <p class="mt-1.5 text-xs font-medium text-fg">{step}</p>
                  <p class="font-mono text-[11px] text-fg-subtle">
                    {copied === hex ? '¡copiado!' : hex}
                  </p>
                </button>
              {/each}
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="k-card p-5">
              <p class="mb-3 text-sm font-medium text-white">Ink · superficies</p>
              <div class="grid grid-cols-3 gap-2">
                {#each inkScale as [step, hex, uso]}
                  <button class="group text-left" onclick={() => copy(hex)}>
                    <div
                      class="h-14 rounded-lg ring-1 ring-white/15"
                      style="background:{hex}"
                    ></div>
                    <p class="mt-1.5 text-xs font-medium text-fg">
                      ink-{step} <span class="text-fg-subtle">· {uso}</span>
                    </p>
                    <p class="font-mono text-[11px] text-fg-subtle">
                      {copied === hex ? '¡copiado!' : hex}
                    </p>
                  </button>
                {/each}
              </div>
            </div>
            <div class="k-card p-5">
              <p class="mb-3 text-sm font-medium text-white">Texto</p>
              <div class="space-y-3">
                {#each textTokens as [name, hex, uso]}
                  <button
                    class="flex w-full items-center gap-3 text-left"
                    onclick={() => copy(hex)}
                  >
                    <span
                      class="h-9 w-9 shrink-0 rounded-lg ring-1 ring-white/10"
                      style="background:{hex}"
                    ></span>
                    <span class="flex-1">
                      <span class="block text-sm" style="color:{hex}">Hablemos de tu proyecto</span>
                      <span class="block font-mono text-[11px] text-fg-subtle"
                        >{name} · {copied === hex ? '¡copiado!' : hex} · {uso}</span
                      >
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="k-card p-5">
              <p class="mb-1 text-sm font-medium text-white">Estado</p>
              <p class="mb-3 text-xs text-fg-subtle">
                Reservados: siempre con icono y texto, nunca como color de serie.
              </p>
              <div class="grid grid-cols-2 gap-2">
                {#each statusTokens as [name, hex, label, Icon]}
                  <button
                    class="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/2 p-2.5 text-left"
                    onclick={() => copy(hex)}
                  >
                    <Icon class="h-4 w-4" style="color:{hex}" />
                    <span class="text-sm text-fg">{label}</span>
                    <span class="ml-auto font-mono text-[11px] text-fg-subtle"
                      >{copied === hex ? '✓' : name}</span
                    >
                  </button>
                {/each}
              </div>
            </div>
            <div class="k-card p-5">
              <p class="mb-1 text-sm font-medium text-white">Series de gráficas</p>
              <p class="mb-3 text-xs text-fg-subtle">
                Orden fijo, validado para daltonismo sobre ink-900. No ciclar: la 6.ª serie va a
                “Otros”.
              </p>
              <div class="flex gap-2">
                {#each seriesTokens as hex, i}
                  <button class="flex-1 text-left" onclick={() => copy(hex)}>
                    <div class="h-10 rounded-md" style="background:{hex}"></div>
                    <p class="mt-1 font-mono text-[11px] text-fg-subtle">
                      {copied === hex ? '✓' : `s${i + 1}`}
                    </p>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </section>

        <!-- ================= TIPOGRAFÍA ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'tipografia',
            'Tipografía',
            'Inter para la interfaz, JetBrains Mono para código, IDs y hashes. Titulares con tracking ajustado.',
          )}
          <div class="k-card divide-y divide-white/6">
            {#each [['Display · 48/700', 'text-5xl font-bold tracking-tight k-text-gradient', 'Infraestructura en Git'], ['H1 · 36/700', 'text-4xl font-bold tracking-tight text-white', 'Proyectos de la organización'], ['H2 · 24/600', 'text-2xl font-semibold tracking-tight text-white', 'Secretos del entorno prod'], ['H3 · 18/600', 'text-lg font-semibold text-white', 'Última analítica de seguridad'], ['Body · 15/400', 'text-[15px] text-fg-muted', 'Cada cambio queda registrado como un commit auditable en tu repositorio GitDB.'], ['Small · 13/400', 'text-[13px] text-fg-subtle', 'Actualizado hace 3 minutos por carlos@kettu.studio'], ['Overline · 11/600', 'text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400', 'Organización'], ['Mono · 13/400', 'font-mono text-[13px] text-fg', 'gvs_7f3a…c91e  ·  a1b2c3d']] as [meta, cls, sample]}
              <div class="grid gap-2 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-baseline">
                <span class="font-mono text-xs text-fg-subtle">{meta}</span>
                <span class={cls}>{sample}</span>
              </div>
            {/each}
            <div class="grid gap-2 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-baseline">
              <span class="font-mono text-xs text-fg-subtle">Gradiente brand</span>
              <span class="text-3xl font-bold tracking-tight"
                ><span class="k-text-gradient">Despliega sin </span><span
                  class="k-text-gradient-brand">miedo</span
                ></span
              >
            </div>
          </div>
        </section>

        <!-- ================= BOTONES ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'botones',
            'Botones',
            'Primario naranja para la acción principal (una por vista). Secundario para el resto; ghost en barras y tablas.',
          )}
          <div class="k-card space-y-6 p-6">
            <div class="flex flex-wrap items-center gap-3">
              <button class="k-btn k-btn-primary"><Plus class="h-4 w-4" />Nuevo proyecto</button>
              <button class="k-btn k-btn-secondary">Cancelar</button>
              <button class="k-btn k-btn-outline-brand"><Rocket class="h-4 w-4" />Desplegar</button>
              <button class="k-btn k-btn-ghost">Ver detalles</button>
              <button class="k-btn k-btn-danger"><Trash class="h-4 w-4" />Eliminar</button>
            </div>
            <div class="k-divider"></div>
            <div class="flex flex-wrap items-center gap-3">
              <button class="k-btn k-btn-primary k-btn-sm">Pequeño</button>
              <button class="k-btn k-btn-primary">Mediano</button>
              <button class="k-btn k-btn-primary k-btn-lg">Grande</button>
              <span class="mx-2 h-6 w-px bg-white/10"></span>
              <button class="k-btn k-btn-secondary k-btn-icon" aria-label="Copiar"
                ><Copy class="h-4 w-4" /></button
              >
              <button class="k-btn k-btn-secondary k-btn-icon k-btn-sm" aria-label="Editar"
                ><Pencil class="h-3.5 w-3.5" /></button
              >
              <button class="k-btn k-btn-ghost k-btn-icon" aria-label="Más acciones"
                ><Ellipsis class="h-4 w-4" /></button
              >
            </div>
            <div class="k-divider"></div>
            <div class="flex flex-wrap items-center gap-3">
              <button class="k-btn k-btn-primary" onclick={fakeLoad} disabled={loading}>
                {#if loading}<LoaderCircle
                    class="h-4 w-4 animate-spin"
                  />Analizando…{:else}<ShieldCheck class="h-4 w-4" />Lanzar análisis{/if}
              </button>
              <button class="k-btn k-btn-primary" disabled>Deshabilitado</button>
              <button class="k-btn k-btn-secondary" disabled>Deshabilitado</button>
              <div
                class="inline-flex overflow-hidden rounded-[0.625rem] border border-white/12 [&>button]:rounded-none [&>button]:border-0 [&>button+button]:border-l [&>button+button]:border-white/10"
              >
                <button class="k-btn k-btn-secondary"><Download class="h-4 w-4" />Exportar</button>
                <button
                  class="k-btn k-btn-secondary k-btn-icon"
                  aria-label="Opciones de exportación"><ChevronDown class="h-4 w-4" /></button
                >
              </div>
              <a
                href="#botones"
                class="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
                >Enlace de texto <ExternalLink class="h-3.5 w-3.5" /></a
              >
            </div>
          </div>
        </section>

        <!-- ================= BADGES ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'badges',
            'Badges y estados',
            'Pastillas redondeadas con fondo al 8 % del color. Un punto o icono acompaña siempre al estado.',
          )}
          <div class="k-card space-y-6 p-6">
            <div class="flex flex-wrap items-center gap-2">
              <span class="k-badge">Neutral</span>
              <span class="k-badge k-badge-brand">Nuevo</span>
              <span class="k-badge k-badge-ok"
                ><span class="h-1.5 w-1.5 rounded-full bg-ok"></span>Operativo</span
              >
              <span class="k-badge k-badge-warn"
                ><span class="h-1.5 w-1.5 rounded-full bg-warn"></span>Degradado</span
              >
              <span class="k-badge k-badge-danger"
                ><span class="h-1.5 w-1.5 rounded-full bg-danger"></span>Caído</span
              >
              <span class="k-badge k-badge-info"><Info class="h-3 w-3" />Beta</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="k-badge k-badge-danger font-semibold">CRITICAL · 2</span>
              <span class="k-badge k-badge-brand font-semibold">HIGH · 5</span>
              <span class="k-badge k-badge-warn font-semibold">MEDIUM · 11</span>
              <span class="k-badge font-semibold">LOW · 23</span>
              <span class="mx-2 h-6 w-px bg-white/10"></span>
              <span class="k-badge font-mono"><GitBranch class="h-3 w-3" />main</span>
              <span class="k-badge font-mono"><GitCommitHorizontal class="h-3 w-3" />a1b2c3d</span>
              <span class="k-kbd">⌘</span><span class="k-kbd">K</span>
            </div>
            <div class="flex flex-wrap items-center gap-6">
              <div class="flex -space-x-2">
                {#each [['CL', 'from-brand-400 to-brand-700'], ['AM', 'from-sky-400 to-blue-700'], ['JR', 'from-teal-400 to-teal-700'], ['+4', '']] as [ini, grad]}
                  <span
                    class="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ring-2 ring-ink-950 {grad
                      ? `bg-linear-to-br ${grad} text-white`
                      : 'bg-ink-700 text-fg-muted'}">{ini}</span
                  >
                {/each}
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-ink-800 text-lg"
                  >🦊<span
                    class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-ok ring-2 ring-ink-950"
                  ></span></span
                >
                <div>
                  <p class="text-sm font-medium text-white">Kettu Studio</p>
                  <p class="text-xs text-fg-subtle">3 proyectos · 8 miembros</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ================= FORMULARIOS ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'formularios',
            'Formularios',
            'Campos sobre ink-900 con foco naranja. Etiqueta arriba, ayuda o error debajo.',
          )}
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="k-card space-y-5 p-6">
              <div>
                <label class="k-label" for="f-nombre">Nombre del proyecto</label>
                <input
                  id="f-nombre"
                  class="k-input"
                  placeholder="checkout-api"
                  value="gitops-cloud"
                />
                <p class="k-help">Se usará como slug en la URL.</p>
              </div>
              <div>
                <label class="k-label" for="f-repo">Repositorio GitDB</label>
                <input
                  id="f-repo"
                  class="k-input font-mono text-[13px]"
                  aria-invalid="true"
                  value="git@github.com:kettu/db"
                />
                <p class="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
                  <CircleX class="h-3.5 w-3.5" />No se puede acceder al repositorio con la clave SSH
                  actual.
                </p>
              </div>
              <div>
                <label class="k-label" for="f-desc">Descripción</label>
                <textarea
                  id="f-desc"
                  class="k-input"
                  rows="3"
                  placeholder="¿Para qué es este proyecto?"></textarea>
              </div>
              <div>
                <label class="k-label" for="f-dis">Organización</label>
                <input id="f-dis" class="k-input" value="Kettu Studio" disabled />
              </div>
            </div>

            <div class="k-card space-y-6 p-6">
              <div class="space-y-3">
                <p class="k-label">Módulos</p>
                {#each [['sso', 'Google SSO', 'Inicio de sesión con Google Workspace'], ['registro', 'Registro abierto', 'Cualquiera puede crear una cuenta'], ['monitoring', 'Monitoring', 'Monitores HTTP de uptime']] as [key, label, desc]}
                  {@const k = key as keyof typeof toggles}
                  <div
                    class="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/1.5 p-3"
                  >
                    <div>
                      <p class="text-sm font-medium text-white">{label}</p>
                      <p class="text-xs text-fg-subtle">{desc}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={toggles[k]}
                      aria-label={label}
                      onclick={() => (toggles[k] = !toggles[k])}
                      class="relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/35 {toggles[
                        k
                      ]
                        ? 'bg-brand-500'
                        : 'bg-ink-600'}"
                    >
                      <span
                        class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {toggles[
                          k
                        ]
                          ? 'translate-x-5'
                          : ''}"
                      ></span>
                    </button>
                  </div>
                {/each}
              </div>
              <div class="grid gap-6 sm:grid-cols-2">
                <fieldset class="space-y-2.5">
                  <legend class="k-label">Permisos</legend>
                  {#each ['read', 'create', 'update', 'delete'] as p, i}
                    <label class="flex items-center gap-2.5 text-sm text-fg"
                      ><input type="checkbox" class="k-checkbox" checked={i < 3} /><span
                        class="font-mono text-[13px]">vault:secrets:{p}</span
                      ></label
                    >
                  {/each}
                </fieldset>
                <fieldset class="space-y-2.5">
                  <legend class="k-label">Entorno</legend>
                  {#each [['dev', 'Desarrollo'], ['staging', 'Staging'], ['prod', 'Producción']] as [id, label]}
                    <label class="flex items-center gap-2.5 text-sm text-fg"
                      ><input
                        type="radio"
                        name="entorno"
                        class="k-checkbox"
                        value={id}
                        bind:group={entorno}
                      />{label}</label
                    >
                  {/each}
                </fieldset>
              </div>
            </div>
          </div>
        </section>

        <!-- ================= DROPDOWNS ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'dropdowns',
            'Dropdowns',
            'Popovers sobre ink-800 con sombra profunda. Se cierran con Esc o clic fuera.',
          )}
          <div class="k-card grid gap-8 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <!-- Select con búsqueda -->
            <div>
              <p class="k-label">Select con búsqueda</p>
              <div class="relative" data-dropdown>
                <button
                  class="k-input flex items-center justify-between gap-2 text-left"
                  aria-haspopup="listbox"
                  aria-expanded={openDropdown === 'select'}
                  onclick={() => toggleDropdown('select')}
                >
                  <span class="truncate font-mono text-[13px]">{region}</span>
                  <ChevronsUpDown class="h-4 w-4 shrink-0 text-fg-subtle" />
                </button>
                {#if openDropdown === 'select'}
                  <div class="k-popover absolute left-0 top-full z-20 mt-1.5 w-72 p-1.5">
                    <label class="relative mb-1 block">
                      <Search
                        class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
                      />
                      <input
                        class="k-input k-input-bare h-8 pl-8"
                        placeholder="Buscar región…"
                        bind:value={regionQuery}
                      />
                    </label>
                    <div class="k-divider mb-1"></div>
                    <ul role="listbox" class="max-h-60 overflow-y-auto">
                      {#each regionesFiltradas as r}
                        <li>
                          <button
                            class="k-menu-item {r.disabled ? 'cursor-not-allowed opacity-40' : ''}"
                            role="option"
                            aria-selected={region === r.id}
                            disabled={r.disabled}
                            onclick={() => {
                              region = r.id;
                              openDropdown = null;
                            }}
                          >
                            <span class="flex-1"
                              ><span class="font-mono text-[13px]">{r.name}</span>
                              <span class="text-xs text-fg-subtle">· {r.hint}</span></span
                            >
                            {#if region === r.id}<Check class="h-4 w-4 text-brand-400" />{/if}
                          </button>
                        </li>
                      {:else}
                        <li class="px-2.5 py-3 text-sm text-fg-subtle">Sin resultados</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Menú de acciones -->
            <div>
              <p class="k-label">Menú de acciones</p>
              <div class="relative" data-dropdown>
                <button
                  class="k-btn k-btn-secondary"
                  aria-haspopup="menu"
                  aria-expanded={openDropdown === 'menu'}
                  onclick={() => toggleDropdown('menu')}
                >
                  Acciones <ChevronDown class="h-4 w-4" />
                </button>
                {#if openDropdown === 'menu'}
                  <div
                    class="k-popover absolute left-0 top-full z-20 mt-1.5 w-56 p-1.5"
                    role="menu"
                  >
                    <button class="k-menu-item" role="menuitem"
                      ><Pencil class="h-4 w-4 text-fg-subtle" />Editar<span class="k-kbd ml-auto"
                        >E</span
                      ></button
                    >
                    <button class="k-menu-item" role="menuitem"
                      ><Copy class="h-4 w-4 text-fg-subtle" />Duplicar<span class="k-kbd ml-auto"
                        >D</span
                      ></button
                    >
                    <button class="k-menu-item" role="menuitem"
                      ><Download class="h-4 w-4 text-fg-subtle" />Exportar JSON</button
                    >
                    <div class="k-divider my-1"></div>
                    <button class="k-menu-item text-red-300 hover:bg-red-500/10!" role="menuitem"
                      ><Trash class="h-4 w-4" />Eliminar</button
                    >
                  </div>
                {/if}
              </div>
            </div>

            <!-- Selector org / proyecto -->
            <div>
              <p class="k-label">Selector de contexto</p>
              <div class="relative" data-dropdown>
                <button
                  class="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/2 p-2 text-left hover:border-white/20"
                  aria-haspopup="listbox"
                  aria-expanded={openDropdown === 'switcher'}
                  onclick={() => toggleDropdown('switcher')}
                >
                  <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-sm"
                    >🦊</span
                  >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-fg-subtle"
                      >{orgs.find((o) => o.slug === orgActual)?.name}</span
                    >
                    <span class="block truncate text-sm font-medium text-white"
                      >{proyectoActual}</span
                    >
                  </span>
                  <ChevronsUpDown class="h-4 w-4 text-fg-subtle" />
                </button>
                {#if openDropdown === 'switcher'}
                  <div class="k-popover absolute left-0 top-full z-20 mt-1.5 w-64 p-1.5">
                    {#each orgs as o, oi}
                      {#if oi > 0}<div class="k-divider my-1"></div>{/if}
                      <p
                        class="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
                      >
                        <Building class="h-3 w-3" />{o.name}
                      </p>
                      {#each o.projects as p}
                        <button
                          class="k-menu-item"
                          role="option"
                          aria-selected={orgActual === o.slug && proyectoActual === p}
                          onclick={() => {
                            orgActual = o.slug;
                            proyectoActual = p;
                            openDropdown = null;
                          }}
                        >
                          <FolderGit2 class="h-4 w-4 text-fg-subtle" /><span class="flex-1"
                            >{p}</span
                          >
                          {#if orgActual === o.slug && proyectoActual === p}<Check
                              class="h-4 w-4 text-brand-400"
                            />{/if}
                        </button>
                      {/each}
                    {/each}
                    <div class="k-divider my-1"></div>
                    <button class="k-menu-item text-brand-300"
                      ><Plus class="h-4 w-4" />Nuevo proyecto</button
                    >
                  </div>
                {/if}
              </div>
            </div>

            <!-- Filtro multiselección -->
            <div>
              <p class="k-label">Filtro multiselección</p>
              <div class="relative" data-dropdown>
                <button
                  class="k-btn k-btn-secondary"
                  aria-haspopup="listbox"
                  aria-expanded={openDropdown === 'filtro'}
                  onclick={() => toggleDropdown('filtro')}
                >
                  <Funnel class="h-4 w-4" />Severidad
                  <span class="k-badge k-badge-brand h-5 px-1.5"
                    >{Object.values(filtros).filter(Boolean).length}</span
                  >
                </button>
                {#if openDropdown === 'filtro'}
                  <div class="k-popover absolute left-0 top-full z-20 mt-1.5 w-52 p-1.5">
                    {#each Object.keys(filtros) as f}
                      {@const key = f as keyof typeof filtros}
                      <label class="k-menu-item capitalize"
                        ><input
                          type="checkbox"
                          class="k-checkbox"
                          bind:checked={filtros[key]}
                        />{f}</label
                      >
                    {/each}
                    <div class="k-divider my-1"></div>
                    <button
                      class="k-menu-item text-fg-muted"
                      onclick={() =>
                        (filtros = { critical: false, high: false, medium: false, low: false })}
                      >Limpiar filtros</button
                    >
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </section>

        <!-- ================= CARDS ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'cards',
            'Cards',
            'rounded-2xl, borde white/10 y fondo white/2, como en kettu.studio. Hover con borde naranja en las navegables.',
          )}

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {#each [{ label: 'Despliegues · 7 d', value: '120', delta: '+18 %', up: true, spark: [4, 6, 5, 8, 7, 10, 12] }, { label: 'Uptime medio', value: '99,92 %', delta: '+0,04', up: true, spark: [9, 9, 8, 9, 10, 9, 10] }, { label: 'Vulnerabilidades', value: '41', delta: '−7', up: true, spark: [12, 11, 11, 9, 8, 8, 6] }, { label: 'p95 respuesta', value: '312 ms', delta: '+22 ms', up: false, spark: [5, 5, 6, 6, 7, 8, 8] }] as stat}
              {@const max = Math.max(...stat.spark)}
              <div class="k-card p-5">
                <p class="text-xs font-medium text-fg-subtle">{stat.label}</p>
                <div class="mt-2 flex items-end justify-between gap-2">
                  <p class="text-2xl font-semibold tracking-tight text-white">{stat.value}</p>
                  <svg viewBox="0 0 60 24" class="h-6 w-16" aria-hidden="true">
                    <polyline
                      fill="none"
                      stroke="#e14607"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      points={stat.spark
                        .map((v, i) => `${i * 10},${22 - (v / max) * 20}`)
                        .join(' ')}
                    />
                  </svg>
                </div>
                <p class="mt-1 text-xs {stat.up ? 'text-green-400' : 'text-amber-400'}">
                  {stat.delta} <span class="text-fg-subtle">vs. semana anterior</span>
                </p>
              </div>
            {/each}
          </div>

          <div class="grid gap-4 lg:grid-cols-3">
            <a href="#cards" class="k-card k-card-hover group block p-5">
              <div class="flex items-start justify-between">
                <span
                  class="grid h-10 w-10 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
                  ><FolderGit2 class="h-5 w-5" /></span
                >
                <span class="k-badge k-badge-ok"
                  ><span class="h-1.5 w-1.5 rounded-full bg-ok"></span>Sano</span
                >
              </div>
              <p class="mt-4 font-semibold text-white">gitops-cloud</p>
              <p class="mt-1 text-sm text-fg-muted">
                Plataforma interna de Kettu: IAM, vault y state IaC.
              </p>
              <div class="mt-4 flex items-center gap-4 text-xs text-fg-subtle">
                <span class="inline-flex items-center gap-1"
                  ><ShieldCheck class="h-3.5 w-3.5" />A</span
                >
                <span class="inline-flex items-center gap-1"><Users class="h-3.5 w-3.5" />8</span>
                <span class="inline-flex items-center gap-1"
                  ><GitBranch class="h-3.5 w-3.5" />main</span
                >
                <ArrowRight
                  class="ml-auto h-4 w-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400"
                />
              </div>
            </a>

            <div class="k-card relative overflow-hidden p-5">
              <div
                class="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl"
              ></div>
              <p
                class="relative text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400"
              >
                Destacado
              </p>
              <p class="relative mt-2 text-lg font-semibold text-white">
                Analiza tu código con Open Report
              </p>
              <p class="relative mt-1 text-sm text-fg-muted">
                Dependencias, vulnerabilidades y licencias en cada push.
              </p>
              <button class="k-btn k-btn-primary k-btn-sm relative mt-4"
                >Empezar<ArrowRight class="h-3.5 w-3.5" /></button
              >
            </div>

            <div
              class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center"
            >
              <span class="grid h-11 w-11 place-items-center rounded-full bg-white/4 text-xl"
                >🦊</span
              >
              <p class="mt-3 font-medium text-white">Aún no hay secretos</p>
              <p class="mt-1 text-sm text-fg-subtle">Crea el primero para el entorno prod.</p>
              <button class="k-btn k-btn-secondary k-btn-sm mt-4"
                ><Plus class="h-3.5 w-3.5" />Nuevo secreto</button
              >
            </div>
          </div>

          <div class="k-card">
            <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p class="font-semibold text-white">Claves de servidor</p>
                <p class="text-xs text-fg-subtle">Card con cabecera y lista</p>
              </div>
              <button class="k-btn k-btn-secondary k-btn-sm"
                ><Plus class="h-3.5 w-3.5" />Nueva clave</button
              >
            </div>
            <ul class="divide-y divide-white/6">
              {#each [['ci-github-actions', 'gvs_7f3a…c91e', 'hace 3 min'], ['pulumi-prod', 'gvs_02bd…11af', 'hace 2 días']] as [name, key, used]}
                <li class="flex items-center gap-4 px-5 py-3.5">
                  <KeyRound class="h-4 w-4 text-fg-subtle" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-white">{name}</p>
                    <p class="font-mono text-xs text-fg-subtle">{key}</p>
                  </div>
                  <span class="hidden text-xs text-fg-subtle sm:block">Usada {used}</span>
                  <button class="k-btn k-btn-ghost k-btn-icon k-btn-sm" aria-label="Más"
                    ><Ellipsis class="h-4 w-4" /></button
                  >
                </li>
              {/each}
            </ul>
          </div>
        </section>

        <!-- ================= TABLAS ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'tablas',
            'Tablas',
            'Cabecera sobria en mayúsculas pequeñas, filas con hover y acciones ghost a la derecha.',
          )}
          <div class="k-card overflow-hidden">
            <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
              <label class="relative w-full sm:w-64">
                <Search
                  class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                />
                <input class="k-input h-9 pl-9" placeholder="Filtrar servicios…" />
              </label>
              <button class="k-btn k-btn-secondary k-btn-sm"
                ><Funnel class="h-3.5 w-3.5" />Estado</button
              >
              <span class="ml-auto text-xs text-fg-subtle">4 servicios</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full min-w-160 text-left text-sm">
                <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                  <tr class="border-b border-white/8">
                    <th class="px-5 py-3 font-semibold">Servicio</th>
                    <th class="px-5 py-3 font-semibold">Estado</th>
                    <th class="px-5 py-3 text-right font-semibold">Uptime</th>
                    <th class="px-5 py-3 text-right font-semibold">p95</th>
                    <th class="px-5 py-3 font-semibold">Último deploy</th>
                    <th class="w-12 px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/6">
                  {#each servicios as s}
                    <tr class="transition-colors hover:bg-white/2.5">
                      <td class="px-5 py-3.5">
                        <p class="font-medium text-white">{s.name}</p>
                        <p class="flex items-center gap-1 font-mono text-xs text-fg-subtle">
                          <GitBranch class="h-3 w-3" />{s.branch}
                        </p>
                      </td>
                      <td class="px-5 py-3.5"
                        ><span class="k-badge {estadoBadge[s.estado]}"
                          ><span class="h-1.5 w-1.5 rounded-full {estadoDot[s.estado]}"
                          ></span>{estadoTexto[s.estado]}</span
                        ></td
                      >
                      <td class="px-5 py-3.5 text-right tabular-nums text-fg">{s.uptime}</td>
                      <td class="px-5 py-3.5 text-right tabular-nums text-fg-muted">{s.p95}</td>
                      <td class="px-5 py-3.5 text-fg-muted">{s.deploy}</td>
                      <td class="px-5 py-3.5"
                        ><button
                          class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                          aria-label="Acciones de {s.name}"><Ellipsis class="h-4 w-4" /></button
                        ></td
                      >
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- ================= NAVEGACIÓN ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'navegacion',
            'Navegación',
            'Tabs con subrayado naranja, control segmentado para periodos, breadcrumbs y paginación.',
          )}
          <div class="k-card space-y-8 p-6">
            <nav class="flex items-center gap-1.5 text-sm text-fg-subtle" aria-label="Breadcrumb">
              <a href="#navegacion" class="hover:text-white">Kettu Studio</a><ChevronRight
                class="h-3.5 w-3.5"
              />
              <a href="#navegacion" class="hover:text-white">gitops-cloud</a><ChevronRight
                class="h-3.5 w-3.5"
              />
              <span class="text-white">Vault</span>
            </nav>

            <div class="border-b border-white/8">
              <div class="-mb-px flex gap-6 overflow-x-auto" role="tablist">
                {#each [['resumen', 'Resumen'], ['dependencias', 'Dependencias'], ['vulnerabilidades', 'Vulnerabilidades', '41'], ['historial', 'Historial']] as [id, label, count]}
                  <button
                    role="tab"
                    aria-selected={tab === id}
                    onclick={() => (tab = id)}
                    class="flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors {tab ===
                    id
                      ? 'border-brand-500 text-white'
                      : 'border-transparent text-fg-subtle hover:text-fg'}"
                  >
                    {label}{#if count}<span class="k-badge h-5 px-1.5 text-[11px]">{count}</span
                      >{/if}
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4">
              <div
                class="inline-flex rounded-[0.625rem] border border-white/10 bg-ink-900 p-1"
                role="radiogroup"
                aria-label="Periodo"
              >
                {#each ['1h', '24h', '7d', '30d', '90d'] as p}
                  <button
                    role="radio"
                    aria-checked={periodo === p}
                    onclick={() => (periodo = p)}
                    class="h-7 rounded-md px-3 text-xs font-medium transition-colors {periodo === p
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-fg-subtle hover:text-fg'}">{p}</button
                  >
                {/each}
              </div>

              <div class="flex items-center gap-1">
                <button
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                  aria-label="Anterior"
                  disabled={page === 1}
                  onclick={() => (page = Math.max(1, page - 1))}
                  ><ChevronLeft class="h-4 w-4" /></button
                >
                {#each [1, 2, 3, 4, 5] as n}
                  <button
                    class="h-8 min-w-8 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors {page ===
                    n
                      ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40'
                      : 'text-fg-muted hover:bg-white/5'}"
                    onclick={() => (page = n)}>{n}</button
                  >
                {/each}
                <button
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                  aria-label="Siguiente"
                  disabled={page === 5}
                  onclick={() => (page = Math.min(5, page + 1))}
                  ><ChevronRight class="h-4 w-4" /></button
                >
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-0">
              {#each [['Repositorio', true], ['Organización', true], ['Administrador', false], ['Listo', false]] as [label, done], i}
                <div class="flex items-center">
                  <span
                    class="flex items-center gap-2 text-sm {done
                      ? 'text-white'
                      : i === 2
                        ? 'text-brand-300'
                        : 'text-fg-subtle'}"
                  >
                    <span
                      class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold {done
                        ? 'bg-brand-500 text-white'
                        : i === 2
                          ? 'ring-2 ring-brand-500 text-brand-300'
                          : 'ring-1 ring-white/15'}"
                    >
                      {#if done}<Check class="h-3.5 w-3.5" />{:else}{i + 1}{/if}
                    </span>
                    {label}
                  </span>
                  {#if i < 3}<span class="mx-3 h-px w-8 {done ? 'bg-brand-500' : 'bg-white/15'}"
                    ></span>{/if}
                </div>
              {/each}
            </div>
          </div>
        </section>

        <!-- ================= FEEDBACK ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'feedback',
            'Feedback',
            'Banners, toasts, progreso, skeletons y modal.',
          )}
          <div class="grid gap-3 md:grid-cols-2">
            {#each banners as { icon: Icon, title, body, box, iconCls }}
              <div class="flex gap-3 rounded-xl border p-4 {box}">
                <Icon class="mt-0.5 h-4 w-4 shrink-0 {iconCls}" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-white">{title}</p>
                  <p class="mt-0.5 text-sm text-fg-muted">{body}</p>
                </div>
                <button class="text-fg-subtle hover:text-white" aria-label="Cerrar"
                  ><X class="h-4 w-4" /></button
                >
              </div>
            {/each}
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="k-card space-y-5 p-6">
              {#each [['Cuota de almacenamiento', 68, 'bg-brand-500'], ['Cobertura de tests', 84, 'bg-ok'], ['Límite de API keys', 92, 'bg-warn']] as [label, value, color]}
                <div>
                  <div class="mb-1.5 flex justify-between text-sm">
                    <span class="text-fg">{label}</span><span class="tabular-nums text-fg-muted"
                      >{value} %</span
                    >
                  </div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-white/6">
                    <div class="h-full rounded-full {color}" style="width:{value}%"></div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="k-card space-y-3 p-6" aria-hidden="true">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 animate-pulse rounded-xl bg-white/6"></div>
                <div class="flex-1 space-y-2">
                  <div class="h-3 w-1/3 animate-pulse rounded bg-white/6"></div>
                  <div class="h-3 w-1/2 animate-pulse rounded bg-white/4"></div>
                </div>
              </div>
              <div class="h-3 w-full animate-pulse rounded bg-white/4"></div>
              <div class="h-3 w-5/6 animate-pulse rounded bg-white/4"></div>
              <div class="h-3 w-2/3 animate-pulse rounded bg-white/4"></div>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              class="k-btn k-btn-secondary"
              onclick={() => showToast('Secreto guardado', 'DATABASE_URL · prod · commit a1b2c3d')}
              >Mostrar toast</button
            >
          </div>
        </section>

        <!-- ================= MODALES ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'modales',
            'Modales',
            'Fondo negro al 60 % con blur, panel sobre ink-800. Se cierran con Esc, con clic fuera o con Cancelar, y bloquean el scroll del fondo.',
          )}
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {#each [{ id: 'confirm', icon: Trash, title: 'Confirmación destructiva', desc: 'Hay que escribir el nombre para habilitar el botón.', tone: 'bg-red-500/10 text-red-400' }, { id: 'form', icon: KeyRound, title: 'Formulario', desc: 'Crear un secreto, con validación en vivo.', tone: 'bg-brand-500/10 text-brand-400' }, { id: 'detalle', icon: MessageSquareText, title: 'Detalle grande', desc: 'Cabecera, tabs, cuerpo con scroll y pie fijo.', tone: 'bg-blue-400/10 text-blue-300' }, { id: 'drawer', icon: PanelRight, title: 'Drawer lateral', desc: 'Panel desde la derecha para ver detalles sin salir de la lista.', tone: 'bg-teal-500/10 text-teal-300' }, { id: 'palette', icon: Command, title: 'Búsqueda ⌘K', desc: 'Paleta de comandos con teclado.', tone: 'bg-white/6 text-fg' }] as m}
              <button
                class="k-card k-card-hover flex flex-col items-start p-5 text-left"
                onclick={() =>
                  m.id === 'palette'
                    ? (paletteOpen = true)
                    : openModal(m.id as Exclude<ModalId, null>)}
              >
                <span class="grid h-9 w-9 place-items-center rounded-lg {m.tone}"
                  ><m.icon class="h-4 w-4" /></span
                >
                <span class="mt-4 text-sm font-semibold text-white">{m.title}</span>
                <span class="mt-1 text-xs text-fg-subtle">{m.desc}</span>
                <span class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-400"
                  >Abrir <ArrowRight class="h-3 w-3" /></span
                >
              </button>
            {/each}
          </div>
          <p class="flex items-center gap-2 text-xs text-fg-subtle">
            También puedes pulsar <span class="k-kbd">⌘</span><span class="k-kbd">K</span> (o
            <span class="k-kbd">Ctrl</span><span class="k-kbd">K</span>) desde cualquier punto de la
            página.
          </p>
        </section>

        <!-- ================= GRÁFICAS ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'graficas',
            'Gráficas',
            'Chart.js con líneas de 2 px, rejilla casi invisible y tooltip sobre ink-800. Series en orden fijo; el estado usa sus colores reservados.',
          )}
          <BrandCharts />
        </section>

        <!-- ================= SIDEBAR ================= -->
        <section class="space-y-6">
          {@render sectionTitle(
            'sidebar',
            'Sidebar',
            'Propuesta para la navegación de la app: selector de contexto arriba, secciones agrupadas y modo colapsado.',
          )}
          <div class="k-card overflow-hidden">
            <div class="flex h-140">
              <aside
                class="flex shrink-0 flex-col border-r border-white/8 bg-ink-950 p-3 transition-[width] duration-200 {collapsed
                  ? 'w-17'
                  : 'w-64'}"
              >
                <button
                  class="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/2 p-2 text-left hover:border-white/20"
                >
                  <span
                    class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-sm"
                    >🦊</span
                  >
                  {#if !collapsed}
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-xs text-fg-subtle">Kettu Studio</span>
                      <span class="block truncate text-sm font-medium text-white">gitops-cloud</span
                      >
                    </span>
                    <ChevronsUpDown class="h-4 w-4 text-fg-subtle" />
                  {/if}
                </button>

                <nav class="mt-6 flex-1 space-y-6 overflow-y-auto">
                  <div>
                    {#if !collapsed}<p class="k-nav-heading">Proyecto</p>{/if}
                    <div class="space-y-0.5">
                      {#each navProyecto as item}
                        <a
                          href="#sidebar"
                          class="k-nav-item {collapsed ? 'justify-center px-0' : ''}"
                          aria-current={item.current ? 'page' : undefined}
                          title={collapsed ? item.label : undefined}
                        >
                          <item.icon class="h-4 w-4 shrink-0" />
                          {#if !collapsed}
                            <span class="flex-1">{item.label}</span>
                            {#if item.badge}<span
                                class="k-badge k-badge-danger h-5 px-1.5 text-[11px]"
                                >{item.badge}</span
                              >{/if}
                          {/if}
                        </a>
                      {/each}
                    </div>
                  </div>
                  <div>
                    {#if !collapsed}<p class="k-nav-heading">Organización</p>{:else}<div
                        class="k-divider mx-2 mb-3"
                      ></div>{/if}
                    <div class="space-y-0.5">
                      {#each navOrg as item}
                        <a
                          href="#sidebar"
                          class="k-nav-item {collapsed ? 'justify-center px-0' : ''}"
                          title={collapsed ? item.label : undefined}
                        >
                          <item.icon class="h-4 w-4 shrink-0" />
                          {#if !collapsed}{item.label}{/if}
                        </a>
                      {/each}
                    </div>
                  </div>
                </nav>

                {#if !collapsed}
                  <div class="mb-3 rounded-xl border border-brand-500/25 bg-brand-500/6 p-3">
                    <p class="text-xs font-medium text-brand-200">GitOps 1.4.0</p>
                    <p class="mt-0.5 text-xs text-fg-subtle">Monitores HTTP disponibles.</p>
                  </div>
                {/if}
                <div
                  class="flex items-center gap-2 border-t border-white/8 pt-3 {collapsed
                    ? 'flex-col'
                    : ''}"
                >
                  <span
                    class="flex items-center gap-1.5 text-xs text-fg-subtle {collapsed
                      ? ''
                      : 'flex-1'}"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-ok"></span>{#if !collapsed}GitDB
                      sincronizado{/if}
                  </span>
                  <button
                    class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                    aria-label={collapsed ? 'Expandir' : 'Colapsar'}
                    onclick={() => (collapsed = !collapsed)}
                  >
                    {#if collapsed}<PanelLeftOpen class="h-4 w-4" />{:else}<PanelLeftClose
                        class="h-4 w-4"
                      />{/if}
                  </button>
                </div>
              </aside>

              <div class="min-w-0 flex-1 overflow-y-auto bg-ink-950/40 p-6">
                <nav class="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <span>Kettu Studio</span><ChevronRight class="h-3 w-3" /><span>gitops-cloud</span
                  ><ChevronRight class="h-3 w-3" /><span class="text-fg">Dashboard</span>
                </nav>
                <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 class="text-2xl font-semibold tracking-tight text-white">Dashboard</h3>
                  <div class="flex gap-2">
                    <button class="k-btn k-btn-secondary k-btn-sm">Ajustes</button><button
                      class="k-btn k-btn-primary k-btn-sm"
                      ><ShieldCheck class="h-3.5 w-3.5" />Analizar</button
                    >
                  </div>
                </div>
                <div class="mt-6 grid gap-3 sm:grid-cols-3">
                  {#each [['Secretos', '24'], ['Stacks', '6'], ['Monitores', '9']] as [l, v]}
                    <div class="k-card p-4">
                      <p class="text-xs text-fg-subtle">{l}</p>
                      <p class="mt-1 text-xl font-semibold text-white">{v}</p>
                    </div>
                  {/each}
                </div>
                <div class="k-card mt-4 h-48 p-4">
                  <div class="space-y-3" aria-hidden="true">
                    <div class="h-3 w-1/4 rounded bg-white/6"></div>
                    <div class="h-3 w-full rounded bg-white/4"></div>
                    <div class="h-3 w-5/6 rounded bg-white/4"></div>
                    <div class="h-3 w-2/3 rounded bg-white/4"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="border-t border-white/8 px-4 py-8 text-center text-xs text-fg-subtle sm:px-8">
        Hecho con 🦊 por Kettu Studio · tokens en <span class="font-mono"
          >src/lib/styles/brand.css</span
        >
      </footer>
    </main>
  </div>

  <!-- ================= MODALES ================= -->
  {#snippet backdrop()}
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-label="Cerrar"
      onclick={() => (modal = null)}
      transition:fade={{ duration: 120 }}
    ></button>
  {/snippet}

  <!-- Confirmación destructiva -->
  {#if modal === 'confirm'}
    <div class="fixed inset-0 z-50 grid place-items-center p-4">
      {@render backdrop()}
      <div
        class="k-popover relative w-full max-w-md p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        transition:scale={{ start: 0.96, duration: 150, easing: cubicOut }}
      >
        <div class="flex items-start gap-4">
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
            ><Trash class="h-5 w-5" /></span
          >
          <div>
            <h3 id="confirm-title" class="text-lg font-semibold text-white">
              ¿Eliminar el proyecto?
            </h3>
            <p class="mt-1 text-sm text-fg-muted">
              Se borrarán sus secretos, roles y monitores. Quedará un commit en GitDB, pero no se
              puede deshacer desde la interfaz.
            </p>
          </div>
        </div>
        <div class="mt-5">
          <label class="k-label" for="confirm"
            >Escribe <span class="font-mono text-brand-300">gitops-cloud</span> para confirmar</label
          >
          <input
            id="confirm"
            class="k-input font-mono text-[13px]"
            autocomplete="off"
            bind:value={confirmText}
            use:autofocus
          />
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button class="k-btn k-btn-secondary" onclick={() => (modal = null)}>Cancelar</button>
          <button
            class="k-btn k-btn-danger"
            disabled={confirmText !== 'gitops-cloud'}
            onclick={() => {
              modal = null;
              showToast('Proyecto eliminado', 'gitops-cloud · commit 4c7d0aa');
            }}>Eliminar proyecto</button
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Formulario -->
  {#if modal === 'form'}
    <div class="fixed inset-0 z-50 grid place-items-center p-4">
      {@render backdrop()}
      <div
        class="k-popover relative w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        transition:scale={{ start: 0.96, duration: 150, easing: cubicOut }}
      >
        <form onsubmit={saveSecret}>
          <div class="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
            <div>
              <h3 id="form-title" class="text-lg font-semibold text-white">Nuevo secreto</h3>
              <p class="mt-0.5 text-sm text-fg-subtle">Se cifra antes de guardarse en GitDB.</p>
            </div>
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
              aria-label="Cerrar"
              onclick={() => (modal = null)}><X class="h-4 w-4" /></button
            >
          </div>

          <div class="space-y-5 px-6 py-5">
            <div>
              <label class="k-label" for="s-name">Nombre</label>
              <input
                id="s-name"
                class="k-input font-mono text-[13px]"
                placeholder="DATABASE_URL"
                autocomplete="off"
                aria-invalid={secretNameInvalid}
                bind:value={secretName}
                use:autofocus
              />
              {#if secretNameInvalid}
                <p class="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
                  <CircleX class="h-3.5 w-3.5" />Solo mayúsculas, números y guiones bajos, empezando
                  por letra.
                </p>
              {:else}
                <p class="k-help">Por ejemplo: STRIPE_SECRET_KEY</p>
              {/if}
            </div>
            <div>
              <label class="k-label" for="s-value">Valor</label>
              <div class="relative">
                <input
                  id="s-value"
                  class="k-input pr-10 font-mono text-[13px]"
                  type={secretVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  autocomplete="off"
                  bind:value={secretValue}
                />
                <button
                  type="button"
                  class="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-white/5 hover:text-white"
                  aria-label={secretVisible ? 'Ocultar valor' : 'Mostrar valor'}
                  onclick={() => (secretVisible = !secretVisible)}
                >
                  {#if secretVisible}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
                </button>
              </div>
            </div>
            <div>
              <p class="k-label">Entorno</p>
              <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Entorno">
                {#each [['dev', 'Desarrollo'], ['staging', 'Staging'], ['prod', 'Producción']] as [id, label]}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={secretEnv === id}
                    onclick={() => (secretEnv = id)}
                    class="rounded-lg border px-3 py-2.5 text-left text-sm transition-colors {secretEnv ===
                    id
                      ? 'border-brand-500/60 bg-brand-500/10 text-white'
                      : 'border-white/10 bg-white/2 text-fg-muted hover:border-white/20'}"
                  >
                    <span class="block font-mono text-[11px] text-fg-subtle">{id}</span>
                    {label}
                  </button>
                {/each}
              </div>
            </div>
            {#if secretEnv === 'prod'}
              <div
                class="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/6 p-3 text-xs text-amber-200"
                transition:fade={{ duration: 100 }}
              >
                <TriangleAlert class="h-4 w-4 shrink-0 text-amber-400" />Los cambios en producción
                notifican a los administradores del proyecto.
              </div>
            {/if}
          </div>

          <div
            class="flex items-center justify-between gap-2 border-t border-white/8 bg-ink-900/60 px-6 py-4"
          >
            <span class="hidden items-center gap-1 text-xs text-fg-subtle sm:flex"
              ><span class="k-kbd">Esc</span> para cerrar</span
            >
            <div class="ml-auto flex gap-2">
              <button type="button" class="k-btn k-btn-secondary" onclick={() => (modal = null)}
                >Cancelar</button
              >
              <button
                type="submit"
                class="k-btn k-btn-primary"
                disabled={!secretName || secretNameInvalid || !secretValue}>Guardar secreto</button
              >
            </div>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Detalle grande -->
  {#if modal === 'detalle'}
    <div class="fixed inset-0 z-50 grid place-items-center p-4">
      {@render backdrop()}
      <div
        class="k-popover relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-title"
        transition:scale={{ start: 0.96, duration: 150, easing: cubicOut }}
      >
        <div class="border-b border-white/8 px-6 pt-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="k-badge k-badge-danger font-semibold">CRITICAL</span>
                <span class="k-badge font-mono">CVE-2026-31337</span>
              </div>
              <h3 id="detalle-title" class="mt-2 text-lg font-semibold text-white">
                Prototype pollution en lodash
              </h3>
              <p class="mt-0.5 text-sm text-fg-subtle">billing-worker · lodash 4.17.20 → 4.17.21</p>
            </div>
            <button
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
              aria-label="Cerrar"
              onclick={() => (modal = null)}><X class="h-4 w-4" /></button
            >
          </div>
          <div class="mt-4 flex gap-6" role="tablist">
            {#each [['descripcion', 'Descripción'], ['afectados', 'Afectados · 3'], ['historial', 'Historial']] as [id, label]}
              <button
                role="tab"
                aria-selected={detalleTab === id}
                onclick={() => (detalleTab = id)}
                class="-mb-px border-b-2 pb-3 text-sm font-medium transition-colors {detalleTab ===
                id
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-fg-subtle hover:text-fg'}">{label}</button
              >
            {/each}
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          {#if detalleTab === 'descripcion'}
            <div class="space-y-4 text-sm text-fg-muted">
              <p>
                Las funciones <span class="font-mono text-fg">merge</span>,
                <span class="font-mono text-fg">mergeWith</span>
                y <span class="font-mono text-fg">defaultsDeep</span> permiten modificar
                <span class="font-mono text-fg">Object.prototype</span> con una entrada manipulada, lo
                que puede derivar en ejecución de código o denegación de servicio.
              </p>
              <div class="grid grid-cols-3 gap-3">
                {#each [['CVSS', '9.1'], ['Exploit', 'Público'], ['Fix', 'Disponible']] as [k, v]}
                  <div class="rounded-lg border border-white/8 bg-white/2 p-3">
                    <p class="text-xs text-fg-subtle">{k}</p>
                    <p class="mt-0.5 font-semibold text-white">{v}</p>
                  </div>
                {/each}
              </div>
              <p class="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                Cómo corregirlo
              </p>
              <pre
                class="overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-4 font-mono text-[13px] leading-relaxed text-fg"><span
                  class="text-fg-subtle"># package.json</span
                >
<span class="text-red-300">-  "lodash": "4.17.20"</span>
<span class="text-green-300">+  "lodash": "^4.17.21"</span>

<span class="text-brand-300">$</span> bun install && bun run test</pre>
              {#each Array(4) as _, i}
                <p>
                  Párrafo de relleno {i + 1} para comprobar el scroll del cuerpo: la cabecera con las
                  tabs y el pie con las acciones se quedan fijos mientras el contenido se desplaza.
                </p>
              {/each}
            </div>
          {:else if detalleTab === 'afectados'}
            <ul class="divide-y divide-white/6">
              {#each [['billing-worker', 'release/1.4'], ['checkout-api', 'main'], ['legacy-cron', 'develop']] as [svc, br]}
                <li class="flex items-center gap-3 py-3">
                  <Server class="h-4 w-4 text-fg-subtle" /><span class="flex-1 text-sm text-white"
                    >{svc}</span
                  ><span class="k-badge font-mono"><GitBranch class="h-3 w-3" />{br}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <ol class="space-y-4 border-l border-white/10 pl-5">
              {#each [['Detectada por Open Report', 'hace 25 min'], ['Alerta enviada a 3 personas', 'hace 24 min'], ['Asignada a Carlos López', 'hace 10 min']] as [t, when]}
                <li class="relative">
                  <span
                    class="absolute -left-6.25 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-ink-800"
                  ></span>
                  <p class="text-sm text-white">{t}</p>
                  <p class="text-xs text-fg-subtle">{when}</p>
                </li>
              {/each}
            </ol>
          {/if}
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-ink-900/60 px-6 py-4"
        >
          <button class="k-btn k-btn-ghost k-btn-sm"
            ><ExternalLink class="h-3.5 w-3.5" />Ver en NVD</button
          >
          <div class="flex gap-2">
            <button class="k-btn k-btn-secondary" onclick={() => (modal = null)}>Ignorar</button>
            <button
              class="k-btn k-btn-primary"
              onclick={() => {
                modal = null;
                showToast('PR creada', 'fix(deps): lodash 4.17.21 · #128');
              }}><GitPullRequest class="h-4 w-4" />Crear PR con el fix</button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Drawer lateral -->
  {#if modal === 'drawer'}
    <div class="fixed inset-0 z-50">
      {@render backdrop()}
      <div
        class="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-ink-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        transition:fly={{ x: 420, duration: 220, easing: cubicOut }}
      >
        <div class="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400">
              Monitor HTTP
            </p>
            <h3 id="drawer-title" class="mt-1 text-lg font-semibold text-white">checkout-api</h3>
            <p class="mt-0.5 font-mono text-xs text-fg-subtle">
              GET https://api.kettu.studio/health
            </p>
          </div>
          <button
            class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
            aria-label="Cerrar"
            onclick={() => (modal = null)}
            use:autofocus><X class="h-4 w-4" /></button
          >
        </div>
        <div class="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div class="flex items-center gap-2">
            <span class="k-badge k-badge-danger"
              ><span class="h-1.5 w-1.5 rounded-full bg-danger"></span>Caído</span
            >
            <span class="text-xs text-fg-subtle">desde hace 2 min · 3 checks fallidos</span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            {#each [['Uptime 30 d', '99,41 %'], ['p95', '640 ms'], ['Intervalo', '60 s'], ['Timeout', '10 s']] as [k, v]}
              <div class="rounded-xl border border-white/8 bg-white/2 p-3">
                <p class="text-xs text-fg-subtle">{k}</p>
                <p class="mt-0.5 text-lg font-semibold text-white">{v}</p>
              </div>
            {/each}
          </div>
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              Últimos checks
            </p>
            <ul class="divide-y divide-white/6 rounded-xl border border-white/8">
              {#each [['503', 'Service Unavailable', 'danger', '12:04:01'], ['503', 'Service Unavailable', 'danger', '12:03:01'], ['504', 'Gateway Timeout', 'danger', '12:02:01'], ['200', 'OK · 212 ms', 'ok', '12:01:01']] as [code, text, tone, at]}
                <li class="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span class="h-1.5 w-1.5 rounded-full {tone === 'ok' ? 'bg-ok' : 'bg-danger'}"
                  ></span>
                  <span class="font-mono text-[13px] text-white">{code}</span>
                  <span class="flex-1 text-fg-muted">{text}</span>
                  <span class="font-mono text-xs text-fg-subtle">{at}</span>
                </li>
              {/each}
            </ul>
          </div>
        </div>
        <div class="flex gap-2 border-t border-white/8 px-6 py-4">
          <button class="k-btn k-btn-secondary flex-1"><Pencil class="h-4 w-4" />Editar</button>
          <button
            class="k-btn k-btn-primary flex-1"
            onclick={() => showToast('Check lanzado', 'checkout-api · resultado en unos segundos')}
            ><Activity class="h-4 w-4" />Probar ahora</button
          >
        </div>
      </div>
    </div>
  {/if}

  <CommandPalette bind:open={paletteOpen} groups={commandGroups} />

  <!-- Toast -->
  {#if toastVisible}
    <div
      class="k-popover fixed bottom-6 right-6 z-70 flex w-80 items-start gap-3 p-4"
      role="status"
      transition:fly={{ y: 12, duration: 180, easing: cubicOut }}
    >
      <CircleCheck class="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
      <div class="flex-1">
        <p class="text-sm font-medium text-white">{toastText.title}</p>
        <p class="mt-0.5 text-xs text-fg-subtle">{toastText.body}</p>
      </div>
      <button
        class="text-fg-subtle hover:text-white"
        aria-label="Cerrar"
        onclick={() => (toastVisible = false)}><X class="h-4 w-4" /></button
      >
    </div>
  {/if}
</div>
