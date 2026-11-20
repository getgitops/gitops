import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';
import { organizationPath, projectPath } from './links';

export const ACCESS_SCOPES = ['cluster', 'organization', 'project'] as const;

const READ_USERS = 'organization:users:read';

const GRANTED = 'access.granted';
const UPDATED = 'access.updated';
const REVOKED = 'access.revoked';
const INVITED = 'user.invited';
const ACCEPTED = 'invitation.accepted';
const ROLE_UPDATED = 'role.updated';
const KEY_CREATED = 'api_key.created';
const KEY_REVOKED = 'api_key.revoked';

type AccessEvent = typeof GRANTED | typeof UPDATED | typeof REVOKED;
type InvitationEvent = typeof INVITED | typeof ACCEPTED;

function userField(type: AccessEvent | InvitationEvent) {
  return {
    key: 'userId',
    label: fieldLabel(type, 'userId'),
    type: 'reference',
    reference: 'user',
    operators: OPERATORS.reference,
  } as const;
}

function roleField(type: AccessEvent | InvitationEvent | typeof ROLE_UPDATED) {
  return {
    key: 'roleId',
    label: fieldLabel(type, 'roleId'),
    type: 'reference',
    reference: 'role',
    operators: OPERATORS.reference,
  } as const;
}

function scopeField(type: AccessEvent | typeof ACCEPTED) {
  return {
    key: 'scope',
    label: fieldLabel(type, 'scope'),
    type: 'enum',
    options: enumOptions('accessScope', ACCESS_SCOPES),
    operators: OPERATORS.enum,
  } as const;
}

function accessFields(type: AccessEvent) {
  return [userField(type), roleField(type), scopeField(type)] as const;
}

function permissionsField(key: 'addedPermissions' | 'removedPermissions') {
  return {
    key,
    label: fieldLabel(ROLE_UPDATED, key),
    type: 'string',
    operators: OPERATORS.list,
  } as const;
}

// access events also feed the fixed system notifications (#81) for the affected user
export const accessEvents: EventDefinitions<
  AccessEvent | InvitationEvent | typeof ROLE_UPDATED | typeof KEY_CREATED | typeof KEY_REVOKED
> = {
  [GRANTED]: {
    link: (context) =>
      projectPath(context, '/settings/access-control') ??
      organizationPath(context, '/settings/access-control'),
    ...eventText(GRANTED),
    module: 'access',
    scope: 'organization',
    readPermission: READ_USERS,
    alertable: true,
    fields: accessFields(GRANTED),
  },
  [UPDATED]: {
    link: (context) =>
      projectPath(context, '/settings/access-control') ??
      organizationPath(context, '/settings/access-control'),
    ...eventText(UPDATED),
    module: 'access',
    scope: 'organization',
    readPermission: READ_USERS,
    alertable: true,
    fields: accessFields(UPDATED),
  },
  [REVOKED]: {
    link: (context) =>
      projectPath(context, '/settings/access-control') ??
      organizationPath(context, '/settings/access-control'),
    ...eventText(REVOKED),
    module: 'access',
    scope: 'organization',
    readPermission: READ_USERS,
    alertable: true,
    fields: accessFields(REVOKED),
  },
  [INVITED]: {
    link: (context) =>
      projectPath(context, '/settings/access-control') ??
      organizationPath(context, '/settings/access-control'),
    ...eventText(INVITED),
    module: 'access',
    scope: 'organization',
    readPermission: READ_USERS,
    alertable: true,
    fields: [userField(INVITED), roleField(INVITED)],
  },
  [ACCEPTED]: {
    link: (context) =>
      projectPath(context, '/settings/access-control') ??
      organizationPath(context, '/settings/access-control'),
    ...eventText(ACCEPTED),
    module: 'access',
    scope: 'organization',
    readPermission: READ_USERS,
    alertable: true,
    fields: [userField(ACCEPTED), roleField(ACCEPTED), scopeField(ACCEPTED)],
  },
  [ROLE_UPDATED]: {
    link: (context) =>
      projectPath(context, '/settings/roles-permissions') ??
      organizationPath(context, '/settings/roles-permissions'),
    ...eventText(ROLE_UPDATED),
    module: 'access',
    scope: 'organization',
    readPermission: 'organization:roles:read',
    alertable: true,
    fields: [
      roleField(ROLE_UPDATED),
      permissionsField('addedPermissions'),
      permissionsField('removedPermissions'),
    ],
  },
  [KEY_CREATED]: {
    link: (context) => projectPath(context, '/settings/server-access-keys'),
    ...eventText(KEY_CREATED),
    module: 'access',
    scope: 'project',
    readPermission: 'project:server-keys:read',
    alertable: true,
    fields: [
      {
        key: 'name',
        label: fieldLabel(KEY_CREATED, 'name'),
        type: 'string',
        operators: OPERATORS.string,
      },
    ],
  },
  [KEY_REVOKED]: {
    link: (context) => projectPath(context, '/settings/server-access-keys'),
    ...eventText(KEY_REVOKED),
    module: 'access',
    scope: 'project',
    readPermission: 'project:server-keys:read',
    alertable: true,
    fields: [
      {
        key: 'apiKeyId',
        label: fieldLabel(KEY_REVOKED, 'apiKeyId'),
        type: 'reference',
        reference: 'api_key',
        operators: OPERATORS.reference,
      },
      {
        key: 'name',
        label: fieldLabel(KEY_REVOKED, 'name'),
        type: 'string',
        operators: OPERATORS.string,
      },
    ],
  },
};
