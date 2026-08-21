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
export type PermissionGrant = Permission | `${PermissionSection}:all`;

export const ALL_PERMISSION_GRANTS: PermissionGrant[] = [
  ...PERMISSION_SECTIONS.flatMap((section) =>
    PERMISSION_ACTIONS.map((action) => `${section}:${action}` as Permission),
  ),
  ...PERMISSION_SECTIONS.map((section) => `${section}:all` as PermissionGrant),
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
export function toggleSectionAll(permissions: readonly string[], section: PermissionSection): string[] {
  const withoutSection = permissions.filter((p) => !p.startsWith(`${section}:`));
  return isSectionFullyGranted(permissions, section)
    ? withoutSection
    : [...withoutSection, `${section}:all`];
}
