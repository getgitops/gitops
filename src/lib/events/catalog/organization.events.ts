import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';
import { organizationPath } from './links';

export const ORGANIZATION_CHANGED_FIELDS = ['name', 'slug', 'description'] as const;

const UPDATED = 'organization.updated';

export const organizationEvents: EventDefinitions<typeof UPDATED> = {
  [UPDATED]: {
    link: (context) => organizationPath(context, '/settings/global'),
    ...eventText(UPDATED),
    module: 'organization',
    scope: 'organization',
    readPermission: 'organization:settings:read',
    alertable: true,
    fields: [
      {
        key: 'changedFields',
        label: fieldLabel(UPDATED, 'changedFields'),
        type: 'enum',
        options: enumOptions('organizationChangedField', ORGANIZATION_CHANGED_FIELDS),
        operators: OPERATORS.list,
      },
    ],
  },
};
