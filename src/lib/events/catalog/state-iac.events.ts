import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions, EventLinkContext } from './types';
import { organizationPath } from './links';

export const STATE_IAC_PROVIDERS = ['gcs', 's3'] as const;

export const STATE_IAC_BACKEND_CHANGED_FIELDS = [
  'name',
  'bucket',
  'prefix',
  'region',
  'endpoint',
  'auth',
  'credentials',
  'enabled',
] as const;

const READ_BACKENDS = 'organization:stateiac:backends:read';

const CREATED = 'state_iac.backend.created';
const UPDATED = 'state_iac.backend.updated';
const DELETED = 'state_iac.backend.deleted';
const BINDING_UPDATED = 'state_iac.binding.updated';

type BackendEvent = typeof CREATED | typeof UPDATED | typeof DELETED;

function backendFields<K extends BackendEvent>(type: K) {
  return [
    {
      key: 'name',
      label: fieldLabel(type, 'name'),
      type: 'string',
      operators: OPERATORS.string,
    },
    {
      key: 'provider',
      label: fieldLabel(type, 'provider'),
      type: 'enum',
      options: enumOptions('stateIacProvider', STATE_IAC_PROVIDERS),
      operators: OPERATORS.enum,
    },
    {
      key: 'bucket',
      label: fieldLabel(type, 'bucket'),
      type: 'string',
      operators: OPERATORS.string,
    },
  ] as const;
}

const settingsLink = (context: EventLinkContext) =>
  organizationPath(context, '/settings/state-iac');

// backends are configured per organization: their events are watched from it
export const stateIacEvents: EventDefinitions<BackendEvent | typeof BINDING_UPDATED> = {
  [CREATED]: {
    link: settingsLink,
    ...eventText(CREATED),
    module: 'state_iac',
    scope: 'organization',
    readPermission: READ_BACKENDS,
    alertable: true,
    fields: backendFields(CREATED),
  },
  [UPDATED]: {
    link: settingsLink,
    ...eventText(UPDATED),
    module: 'state_iac',
    scope: 'organization',
    readPermission: READ_BACKENDS,
    alertable: true,
    fields: [
      ...backendFields(UPDATED),
      {
        key: 'changedFields',
        label: fieldLabel(UPDATED, 'changedFields'),
        type: 'enum',
        options: enumOptions('stateIacBackendChangedField', STATE_IAC_BACKEND_CHANGED_FIELDS),
        operators: OPERATORS.list,
      },
    ],
  },
  [DELETED]: {
    link: settingsLink,
    ...eventText(DELETED),
    module: 'state_iac',
    scope: 'organization',
    readPermission: READ_BACKENDS,
    alertable: true,
    fields: backendFields(DELETED),
  },
  [BINDING_UPDATED]: {
    link: settingsLink,
    ...eventText(BINDING_UPDATED),
    module: 'state_iac',
    scope: 'organization',
    readPermission: READ_BACKENDS,
    alertable: true,
    fields: [
      {
        key: 'backendName',
        label: fieldLabel(BINDING_UPDATED, 'backendName'),
        type: 'string',
        operators: OPERATORS.string,
      },
      {
        key: 'pulumiProject',
        label: fieldLabel(BINDING_UPDATED, 'pulumiProject'),
        type: 'string',
        operators: OPERATORS.string,
      },
      {
        key: 'projectId',
        label: fieldLabel(BINDING_UPDATED, 'projectId'),
        type: 'reference',
        reference: 'project',
        operators: OPERATORS.reference,
      },
      {
        key: 'previousProjectId',
        label: fieldLabel(BINDING_UPDATED, 'previousProjectId'),
        type: 'reference',
        reference: 'project',
        operators: OPERATORS.reference,
      },
    ],
  },
};
