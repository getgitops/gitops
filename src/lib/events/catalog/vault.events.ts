import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';

export const VAULT_SECRET_CHANGED_FIELDS = ['key', 'description', 'folder', 'values'] as const;

const READ_SECRETS = 'project:vault:secrets:read';
const READ_ENVIRONMENTS = 'project:vault:environments:read';

const SECRET_CREATED = 'vault.secret.created';
const SECRET_UPDATED = 'vault.secret.updated';
const SECRET_DELETED = 'vault.secret.deleted';
const ENV_IMPORTED = 'vault.env.imported';
const ENVIRONMENT_CREATED = 'vault.environment.created';
const ENVIRONMENT_DELETED = 'vault.environment.deleted';

type SecretEvent = typeof SECRET_CREATED | typeof SECRET_UPDATED | typeof SECRET_DELETED;
type EnvironmentEvent = typeof ENVIRONMENT_CREATED | typeof ENVIRONMENT_DELETED;

function secretFields<K extends SecretEvent>(type: K) {
  return [
    { key: 'key', label: fieldLabel(type, 'key'), type: 'string', operators: OPERATORS.string },
    {
      key: 'environmentIds',
      label: fieldLabel(type, 'environmentIds'),
      type: 'reference',
      reference: 'vault_environment',
      operators: OPERATORS.list,
    },
    {
      key: 'folderPath',
      label: fieldLabel(type, 'folderPath'),
      type: 'string',
      operators: OPERATORS.string,
    },
  ] as const;
}

function environmentFields<K extends EnvironmentEvent>(type: K) {
  return [
    {
      key: 'environmentId',
      label: fieldLabel(type, 'environmentId'),
      type: 'reference',
      reference: 'vault_environment',
      operators: OPERATORS.reference,
    },
    { key: 'name', label: fieldLabel(type, 'name'), type: 'string', operators: OPERATORS.string },
  ] as const;
}

export const vaultEvents: EventDefinitions<SecretEvent | typeof ENV_IMPORTED | EnvironmentEvent> = {
  [SECRET_CREATED]: {
    ...eventText(SECRET_CREATED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_SECRETS,
    alertable: true,
    fields: secretFields(SECRET_CREATED),
  },
  [SECRET_UPDATED]: {
    ...eventText(SECRET_UPDATED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_SECRETS,
    alertable: true,
    fields: [
      ...secretFields(SECRET_UPDATED),
      {
        key: 'changedFields',
        label: fieldLabel(SECRET_UPDATED, 'changedFields'),
        type: 'enum',
        options: enumOptions('secretChangedField', VAULT_SECRET_CHANGED_FIELDS),
        operators: OPERATORS.list,
      },
    ],
  },
  [SECRET_DELETED]: {
    ...eventText(SECRET_DELETED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_SECRETS,
    alertable: true,
    fields: secretFields(SECRET_DELETED),
  },
  [ENV_IMPORTED]: {
    ...eventText(ENV_IMPORTED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_SECRETS,
    alertable: true,
    fields: [
      {
        key: 'environmentId',
        label: fieldLabel(ENV_IMPORTED, 'environmentId'),
        type: 'reference',
        reference: 'vault_environment',
        operators: OPERATORS.reference,
      },
      {
        key: 'folderPath',
        label: fieldLabel(ENV_IMPORTED, 'folderPath'),
        type: 'string',
        operators: OPERATORS.string,
      },
      {
        key: 'created',
        label: fieldLabel(ENV_IMPORTED, 'created'),
        type: 'number',
        operators: OPERATORS.number,
      },
      {
        key: 'updated',
        label: fieldLabel(ENV_IMPORTED, 'updated'),
        type: 'number',
        operators: OPERATORS.number,
      },
    ],
  },
  [ENVIRONMENT_CREATED]: {
    ...eventText(ENVIRONMENT_CREATED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_ENVIRONMENTS,
    alertable: true,
    fields: environmentFields(ENVIRONMENT_CREATED),
  },
  [ENVIRONMENT_DELETED]: {
    ...eventText(ENVIRONMENT_DELETED),
    module: 'vault',
    scope: 'project',
    readPermission: READ_ENVIRONMENTS,
    alertable: true,
    fields: environmentFields(ENVIRONMENT_DELETED),
  },
};
