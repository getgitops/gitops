import permissionsCatalog from '$lib/config/permissions';

export const PERMISSION_SECTIONS = ['vault', 'openreport', 'stateiac'] as const;
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_SECTION_LABELS: Record<PermissionSection, string> = {
  vault: 'Vault',
  openreport: 'Open Report',
  stateiac: 'State IaC',
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'View / List',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
};

export type Permission = `${PermissionSection}:${PermissionAction}`;
export type PermissionGrant = string;
export type PermissionScope = 'cluster' | 'organization' | 'project';

type PermissionConfigSection = {
  permissions?: string[];
  sections?: Record<string, PermissionConfigSection> | PermissionConfigSection[];
};

function permissionChildren(section: PermissionConfigSection): PermissionConfigSection[] {
  if (!section.sections) return [];
  return Array.isArray(section.sections) ? section.sections : Object.values(section.sections);
}

function collectPermissionGrants(section: PermissionConfigSection): string[] {
  return [
    ...(section.permissions ?? []),
    ...permissionChildren(section).flatMap((child) => collectPermissionGrants(child)),
  ];
}

// historically stripped the leading scope segment for a shorter "canonical" stored form, but
// CanCanService.hasPermission compares raw strings with no scope-aware reconstruction — the
// catalog permission string (e.g. 'organization:projects:read') IS the stored/checked grant.
export function toStoredPermissionGrant(
  permission: string,
  _scope: PermissionScope,
): PermissionGrant {
  return permission;
}

const CATALOG_PERMISSION_GRANTS = Object.values(permissionsCatalog.sections).flatMap((section) =>
  collectPermissionGrants(section),
);

export const ALL_PERMISSION_GRANTS: PermissionGrant[] = [
  ...CATALOG_PERMISSION_GRANTS,
  ...PERMISSION_SECTIONS.flatMap((section) =>
    PERMISSION_ACTIONS.map((action) => `${section}:${action}` as Permission),
  ),
  ...PERMISSION_SECTIONS.map((section) => `${section}:all`),
];

const ALL_PERMISSION_GRANTS_SET = new Set<string>(ALL_PERMISSION_GRANTS);

export function isValidPermissionGrant(value: string): value is PermissionGrant {
  return ALL_PERMISSION_GRANTS_SET.has(value);
}

export function isPermissionActionSelected(
  grants: readonly string[],
  section: PermissionSection,
  action: PermissionAction,
): boolean {
  if (!grants || grants.length === 0) return false;

  const permission: Permission = `${section}:${action}`;

  return grants.includes(permission) || grants.includes(`${section}:all`);
}

export function isSectionFullyGranted(
  permissions: readonly string[],
  section: PermissionSection,
): boolean {
  return permissions.includes(`${section}:all`);
}

/** Toggles a single section:action grant, expanding a `section:all` shortcut if present. */
export function togglePermissionAction(
  permissions: readonly string[],
  section: PermissionSection,
  action: PermissionAction,
): string[] {
  if (isSectionFullyGranted(permissions, section)) {
    const expanded = PERMISSION_ACTIONS.filter((a) => a !== action).map(
      (a) => `${section}:${a}` as Permission,
    );
    return [...permissions.filter((p) => p !== `${section}:all`), ...expanded];
  }

  const permission: Permission = `${section}:${action}`;
  return permissions.includes(permission)
    ? permissions.filter((p) => p !== permission)
    : [...permissions, permission];
}

/** Toggles the `section:all` shortcut, replacing any explicit grants for that section. */
export function toggleSectionAll(
  permissions: readonly string[],
  section: PermissionSection,
): string[] {
  const withoutSection = permissions.filter((p) => !p.startsWith(`${section}:`));
  return isSectionFullyGranted(permissions, section)
    ? withoutSection
    : [...withoutSection, `${section}:all`];
}
