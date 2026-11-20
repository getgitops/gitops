import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';

export const PROJECT_CHANGED_FIELDS = [
  'name',
  'slug',
  'description',
  'status',
  'modules',
  'organization',
  'settings',
] as const;

const READ_PROJECTS = 'organization:projects:read';

const CREATED = 'project.created';
const UPDATED = 'project.updated';
const DELETED = 'project.deleted';

function nameField<K extends typeof CREATED | typeof UPDATED | typeof DELETED>(type: K) {
  return {
    key: 'name',
    label: fieldLabel(type, 'name'),
    type: 'string',
    operators: OPERATORS.string,
  } as const;
}

function projectField<K extends typeof UPDATED | typeof DELETED>(type: K) {
  return {
    key: 'projectId',
    label: fieldLabel(type, 'projectId'),
    type: 'reference',
    reference: 'project',
    operators: OPERATORS.reference,
  } as const;
}

// projects are watched from their organization: an org admin alerts on its projects
export const projectEvents: EventDefinitions<typeof CREATED | typeof UPDATED | typeof DELETED> = {
  [CREATED]: {
    ...eventText(CREATED),
    module: 'projects',
    scope: 'organization',
    readPermission: READ_PROJECTS,
    alertable: true,
    fields: [nameField(CREATED)],
  },
  [UPDATED]: {
    ...eventText(UPDATED),
    module: 'projects',
    scope: 'organization',
    readPermission: READ_PROJECTS,
    alertable: true,
    fields: [
      projectField(UPDATED),
      nameField(UPDATED),
      {
        key: 'changedFields',
        label: fieldLabel(UPDATED, 'changedFields'),
        type: 'enum',
        options: enumOptions('projectChangedField', PROJECT_CHANGED_FIELDS),
        operators: OPERATORS.list,
      },
    ],
  },
  [DELETED]: {
    ...eventText(DELETED),
    module: 'projects',
    scope: 'organization',
    readPermission: READ_PROJECTS,
    alertable: true,
    fields: [projectField(DELETED), nameField(DELETED)],
  },
};
