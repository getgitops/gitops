export const CLUSTER_ADMIN_PERMISSIONS = [
  'cluster:organization:all',
  'cluster:projects:all',
  'cluster:users:all',
  'cluster:settings:all',
];

// base role for self-registered users: no admin rights, only enough to start an organization
export const CLUSTER_USER_PERMISSIONS: string[] = ['cluster:organization:create'];

export const ORGANIZATION_ADMIN_PERMISSIONS = [
  'organization:projects:all',
  'organization:users:all',
  'organization:roles:all',
  'organization:settings:all',
  'organization:backups:all',
  'organization:server-keys:all',
  'organization:audit:all',
];

export const ORGANIZATION_DEVELOPER_PERMISSIONS = [
  'organization:projects:read',
  'organization:projects:create',
  'organization:projects:update',
];

export const PROJECT_ADMIN_PERMISSIONS = [
  'project:project:all',
  'project:users:all',
  'project:roles:all',
  'project:server-keys:all',
  'project:audit:all',
  'project:vault:secrets:all',
  'project:vault:environments:all',
  'project:codereport:reports:all',
  'project:codereport:dependencies:all',
  'project:codereport:vulnerabilities:all',
  'project:stateiac:stacks:all',
  'project:stateiac:states:all',
  'project:stateiac:history:all',
];

export const PROJECT_DEVELOPER_PERMISSIONS = [
  'project:project:read',
  'project:vault:secrets:read',
  'project:vault:secrets:create',
  'project:vault:secrets:update',
  'project:vault:environments:read',
  'project:vault:environments:create',
  'project:vault:environments:update',
  'project:codereport:reports:read',
  'project:codereport:reports:create',
  'project:codereport:reports:update',
  'project:codereport:dependencies:read',
  'project:codereport:dependencies:create',
  'project:codereport:dependencies:update',
  'project:codereport:vulnerabilities:read',
  'project:codereport:vulnerabilities:create',
  'project:codereport:vulnerabilities:update',
  'project:stateiac:stacks:read',
  'project:stateiac:stacks:create',
  'project:stateiac:stacks:update',
  'project:stateiac:states:read',
  'project:stateiac:states:create',
  'project:stateiac:states:update',
  'project:stateiac:history:read',
  'project:stateiac:history:create',
  'project:stateiac:history:update',
];

export const PROJECT_VIEWER_PERMISSIONS = [
  'project:project:read',
  'project:users:read',
  'project:roles:read',
  'project:server-keys:read',
  'project:audit:read',
  'project:vault:secrets:read',
  'project:vault:environments:read',
  'project:codereport:reports:read',
  'project:codereport:dependencies:read',
  'project:codereport:vulnerabilities:read',
  'project:stateiac:stacks:read',
  'project:stateiac:states:read',
  'project:stateiac:history:read',
];
