// Árbol de navegación de la app: categoría > módulo > elementos.
// Lo consumen el sidebar (AppSidebar) y la búsqueda global (CommandPalette del layout),
// así ambos muestran exactamente las mismas rutas según los permisos del usuario.
import type { Component } from 'svelte';
import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  Database,
  FolderKanban,
  GitBranch,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Plug,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Users,
} from '@lucide/svelte';

export type NavIcon = Component<any>;
export type NavItem = { label: string; href: string; icon: NavIcon };
// Un módulo es una entrada del sidebar. Si tiene varios `items`, el layout los pinta como pestañas
// encima del contenido. `base` es su espacio de URLs: lo mantiene activo en cualquier subruta.
export type NavModule = { id: string; name: string; icon: NavIcon; items: NavItem[]; base?: string };
// `sidebar: false`: solo en la búsqueda y en las pestañas (p. ej. ajustes de GitOps, que van en el
// menú de cuenta)
export type NavCategory = { name: string; modules: NavModule[]; sidebar?: boolean };

export type NavProject = {
  slug: string;
  modules?: { vault: boolean; codereport: boolean; stateiac: boolean; monitoring?: boolean };
};

export type NavAccess = {
  canAccessClusterSettings?: boolean;
  canManageOrganization?: boolean;
  canManageProject?: boolean;
  canReadOrgProjects?: boolean;
  canReadOrgUsers?: boolean;
  canReadOrgRoles?: boolean;
  canReadOrgGlobal?: boolean;
  canReadOrgBackups?: boolean;
  canReadOrgServerKeys?: boolean;
  canReadOrgAudit?: boolean;
  canReadOrgEvents?: boolean;
  canReadOrganizationAlerts?: boolean;
  canReadProjectInfo?: boolean;
  canReadProjectUsers?: boolean;
  canReadProjectRoles?: boolean;
  canReadProjectServerKeys?: boolean;
  canReadProjectAudit?: boolean;
  canReadProjectAlerts?: boolean;
  canReadProjectVault?: boolean;
  canReadProjectCodeReport?: boolean;
  canReadProjectStateIac?: boolean;
  canReadProjectMonitoring?: boolean;
};

export type NavContext = {
  organizationSlug: string | null;
  currentProjectSlug: string | null;
  projects: NavProject[];
  access: NavAccess;
};

type Translate = (id: string) => string;

function visibleItems(items: (NavItem & { visible?: boolean })[]): NavItem[] {
  return items.filter((item) => item.visible).map(({ visible: _visible, ...item }) => item);
}

export function buildNavigation(
  { organizationSlug, currentProjectSlug, projects, access }: NavContext,
  t: Translate,
): NavCategory[] {
  const project = projects.find((p) => p.slug === currentProjectSlug) ?? null;
  const projectBase = `/org/${organizationSlug}/projects/${currentProjectSlug}`;
  const categories: NavCategory[] = [];

  // Proyecto: el dashboard y los productos activos, directamente
  if (organizationSlug && project) {
    const modules: NavModule[] = [
      {
        id: 'project-dashboard',
        name: t('sidebar.items.projectDashboard'),
        icon: LayoutDashboard,
        items: [
          {
            label: t('sidebar.items.projectDashboard'),
            href: `${projectBase}/overview`,
            icon: LayoutDashboard,
          },
        ],
      },
    ];

    if (project.modules?.codereport && access.canReadProjectCodeReport) {
      modules.push({
        id: 'code-report',
        name: t('sidebar.modules.codeReport'),
        icon: BarChart3,
        base: `${projectBase}/code-report`,
        items: [
          {
            label: t('sidebar.items.dashboard'),
            href: `${projectBase}/code-report/dashboard`,
            icon: LayoutDashboard,
          },
          {
            label: t('sidebar.items.services'),
            href: `${projectBase}/code-report/services`,
            icon: Layers,
          },
          {
            label: t('sidebar.items.cves'),
            href: `/org/${organizationSlug}/cves?project=${currentProjectSlug}`,
            icon: ShieldAlert,
          },
          {
            label: t('sidebar.items.securityPolicies'),
            href: `${projectBase}/code-report/security-policy`,
            icon: Shield,
          },
          {
            label: t('sidebar.items.history'),
            href: `${projectBase}/code-report/history`,
            icon: GitBranch,
          },
          {
            label: t('sidebar.items.settings'),
            href: `${projectBase}/code-report/settings`,
            icon: Settings,
          },
        ],
      });
    }

    if (project.modules?.vault && access.canReadProjectVault) {
      modules.push({
        id: 'vault',
        name: t('sidebar.modules.vault'),
        icon: Shield,
        base: `${projectBase}/vault`,
        items: [
          { label: 'Secrets', href: `${projectBase}/vault`, icon: Shield },
          { label: 'Integrations', href: `${projectBase}/vault/integrations`, icon: Plug },
          { label: 'Settings', href: `${projectBase}/vault/settings`, icon: Settings },
        ],
      });
    }

    if (project.modules?.stateiac && access.canReadProjectStateIac) {
      modules.push({
        id: 'state-iac',
        name: t('sidebar.modules.stateIac'),
        icon: GitBranch,
        base: `${projectBase}/state-iac`,
        items: [
          {
            label: t('sidebar.modules.stateIac'),
            href: `${projectBase}/state-iac`,
            icon: GitBranch,
          },
        ],
      });
    }

    if (project.modules?.monitoring && access.canReadProjectMonitoring) {
      modules.push({
        id: 'monitoring',
        name: t('sidebar.modules.monitoring'),
        icon: Activity,
        base: `${projectBase}/monitoring`,
        items: [
          {
            label: t('sidebar.items.dashboard'),
            href: `${projectBase}/monitoring/dashboard`,
            icon: LayoutDashboard,
          },
          {
            label: t('sidebar.items.monitors'),
            href: `${projectBase}/monitoring/monitors`,
            icon: Activity,
          },
        ],
      });
    }

    if (access.canManageProject) {
      const items = visibleItems([
        {
          label: t('sidebar.items.information'),
          href: `${projectBase}/settings/overview`,
          icon: Info,
          visible: access.canReadProjectInfo,
        },
        {
          label: t('sidebar.items.accessControl'),
          href: `${projectBase}/settings/access-control`,
          icon: Users,
          visible: access.canReadProjectUsers,
        },
        {
          label: t('sidebar.items.rolesAndPermissions'),
          href: `${projectBase}/settings/roles-permissions`,
          icon: Shield,
          visible: access.canReadProjectRoles,
        },
        {
          label: t('sidebar.items.audit'),
          href: `${projectBase}/settings/audit`,
          icon: ScrollText,
          visible: access.canReadProjectAudit,
        },
        {
          label: t('sidebar.items.alerts'),
          href: `${projectBase}/settings/alerts`,
          icon: BellRing,
          visible: access.canReadProjectAlerts,
        },
        {
          label: t('sidebar.items.serverKeys'),
          href: `${projectBase}/settings/server-access-keys`,
          icon: KeyRound,
          visible: access.canReadProjectServerKeys,
        },
      ]);
      if (items.length > 0) {
        modules.push({
          id: 'project-settings',
          name: t('sidebar.items.settings'),
          icon: Settings,
          base: `${projectBase}/settings`,
          items,
        });
      }
    }

    categories.push({ name: t('sidebar.categories.proyecto'), modules });
  }

  // Organización
  const orgModules: NavModule[] = [];
  if (organizationSlug) {
    const orgBase = `/org/${organizationSlug}/settings`;
    orgModules.push(
      {
        id: 'org-overview',
        name: t('sidebar.items.overview'),
        icon: FolderKanban,
        items: [
          {
            label: t('sidebar.items.overview'),
            href: `/org/${organizationSlug}/overview`,
            icon: FolderKanban,
          },
        ],
      },
      {
        id: 'org-cves',
        name: t('sidebar.items.cves'),
        icon: ShieldAlert,
        items: [
          { label: t('sidebar.items.cves'), href: `/org/${organizationSlug}/cves`, icon: ShieldAlert },
        ],
      },
    );

    if (access.canManageOrganization) {
      const items = visibleItems([
        {
          label: t('sidebar.items.projects'),
          href: `${orgBase}/projects`,
          icon: FolderKanban,
          visible: access.canReadOrgProjects,
        },
        {
          label: t('sidebar.items.global'),
          href: `${orgBase}/global`,
          icon: Shield,
          visible: access.canReadOrgGlobal,
        },
        {
          label: t('sidebar.items.accessControl'),
          href: `${orgBase}/access-control`,
          icon: Users,
          visible: access.canReadOrgUsers,
        },
        {
          label: t('sidebar.items.rolesAndPermissions'),
          href: `${orgBase}/roles-permissions`,
          icon: Users,
          visible: access.canReadOrgRoles,
        },
        {
          label: t('sidebar.items.systemAndBackup'),
          href: `${orgBase}/system-backup`,
          icon: Database,
          visible: access.canReadOrgBackups,
        },
        {
          label: t('sidebar.items.serverAccessKeys'),
          href: `${orgBase}/server-access-keys`,
          icon: KeyRound,
          visible: access.canReadOrgServerKeys,
        },
        {
          label: t('sidebar.items.audit'),
          href: `${orgBase}/audit`,
          icon: ScrollText,
          visible: access.canReadOrgAudit,
        },
        {
          label: t('sidebar.items.events'),
          href: `${orgBase}/events`,
          icon: Activity,
          visible: access.canReadOrgEvents,
        },
        {
          label: t('sidebar.items.alerts'),
          href: `${orgBase}/alerts`,
          icon: BellRing,
          visible: access.canReadOrganizationAlerts,
        },
      ]);
      if (items.length > 0) {
        orgModules.push({
          id: 'org-settings',
          name: t('sidebar.items.settings'),
          icon: Settings,
          base: orgBase,
          items,
        });
      }
    }
  } else {
    orgModules.push({
      id: 'select-organization',
      name: t('sidebar.items.selectOrganization'),
      icon: Building2,
      items: [
        {
          label: t('sidebar.items.selectOrganization'),
          href: '/gitops-settings/orgs',
          icon: Building2,
        },
      ],
    });
  }
  categories.push({ name: t('sidebar.categories.organization'), modules: orgModules });

  // Ajustes de GitOps: en el menú de cuenta, no en el sidebar
  if (access.canAccessClusterSettings) {
    categories.push({
      name: t('sidebar.categories.gitops'),
      sidebar: false,
      modules: [
        {
          id: 'cluster-settings',
          name: t('sidebar.modules.clusterSettings'),
          icon: Building2,
          base: '/gitops-settings',
          items: [
            {
              label: t('sidebar.items.organizations'),
              href: '/gitops-settings/orgs',
              icon: Building2,
            },
            {
              label: t('sidebar.items.rolesAndPermissions'),
              href: '/gitops-settings/roles-permissions',
              icon: Shield,
            },
            {
              label: t('sidebar.items.accessControl'),
              href: '/gitops-settings/access-control',
              icon: Users,
            },
            {
              label: t('sidebar.items.registration'),
              href: '/gitops-settings/registration',
              icon: KeyRound,
            },
            {
              label: t('sidebar.items.database'),
              href: '/gitops-settings/database',
              icon: Database,
            },
            {
              label: t('sidebar.items.auditLog'),
              href: '/gitops-settings/audit',
              icon: ScrollText,
            },
          ],
        },
      ],
    });
  }

  return categories;
}

export function isItemActive(pathname: string, href: string) {
  // los href con query (CVEs filtradas por proyecto) nunca coinciden con el pathname, a propósito:
  // así la página de CVEs solo marca el módulo de Inicio
  return pathname.startsWith(href);
}

/** El elemento del módulo que corresponde a la ruta: el de href más largo que la contiene. */
export function activeItem(pathname: string, navModule: NavModule): NavItem | null {
  let best: NavItem | null = null;
  for (const item of navModule.items) {
    if (isItemActive(pathname, item.href) && item.href.length > (best?.href.length ?? -1)) best = item;
  }
  return best;
}

export function isModuleActive(pathname: string, navModule: NavModule) {
  if (navModule.base && pathname.startsWith(navModule.base)) return true;
  return navModule.items.some((item) => isItemActive(pathname, item.href));
}
