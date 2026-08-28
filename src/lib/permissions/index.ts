import permissionsCatalog from '$lib/config/permissions';

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

/**
 * Grants are always canonical: `<scope>:<resource path>:<action>`, exactly as declared in the
 * catalog (`project:vault:secrets:read`, `organization:projects:create`, `cluster:users:invite`).
 */
const GRANTS_BY_SCOPE = Object.fromEntries(
  Object.entries(permissionsCatalog.sections).map(([scope, section]) => [
    scope,
    collectPermissionGrants(section as PermissionConfigSection),
  ]),
) as Record<PermissionScope, PermissionGrant[]>;

export const ALL_PERMISSION_GRANTS: PermissionGrant[] = Object.values(GRANTS_BY_SCOPE).flat();

const ALL_PERMISSION_GRANTS_SET = new Set<string>(ALL_PERMISSION_GRANTS);

// grants used to be stored without their scope prefix (`vault:secrets:read`, `project:all`);
// each scope keeps a lookup from that legacy shape back to its canonical grant
const LEGACY_ALIASES_BY_SCOPE = Object.fromEntries(
  Object.entries(GRANTS_BY_SCOPE).map(([scope, grants]) => [
    scope,
    new Map(grants.map((grant) => [grant.slice(scope.length + 1), grant])),
  ]),
) as Record<PermissionScope, Map<string, PermissionGrant>>;

export function isValidPermissionGrant(value: string): value is PermissionGrant {
  return ALL_PERMISSION_GRANTS_SET.has(value);
}

/** Upgrades a legacy scope-less grant to its canonical form; canonical and unknown grants pass through. */
export function normalizePermissionGrant(grant: string, scope: PermissionScope): PermissionGrant {
  if (ALL_PERMISSION_GRANTS_SET.has(grant)) return grant;
  return LEGACY_ALIASES_BY_SCOPE[scope]?.get(grant) ?? grant;
}

export function normalizePermissionGrants(
  grants: readonly string[],
  scope: PermissionScope,
): PermissionGrant[] {
  return [...new Set(grants.map((grant) => normalizePermissionGrant(grant, scope)))];
}
