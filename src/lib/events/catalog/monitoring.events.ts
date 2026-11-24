import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';
import { projectPath } from './links';

/** Causes a check reports (`#lib/monitoring/types` `CheckCause`). */
export const MONITORING_CAUSES = [
  'timeout',
  'dns',
  'connection',
  'tls',
  'unexpected_status',
  'slow_response',
  'blocked_target',
  'too_many_redirects',
  'invalid_url',
  'error',
] as const;

const READ_MONITORS = 'project:monitoring:monitors:read';

const DOWN = 'monitoring.monitor.down';
const DEGRADED = 'monitoring.monitor.degraded';
const RECOVERED = 'monitoring.monitor.recovered';

type MonitoringEvent = typeof DOWN | typeof DEGRADED | typeof RECOVERED;

function fields<K extends MonitoringEvent>(type: K) {
  return [
    {
      key: 'monitorId',
      label: fieldLabel(type, 'monitorId'),
      type: 'reference',
      reference: 'monitor',
      operators: OPERATORS.reference,
    },
    {
      key: 'serviceId',
      label: fieldLabel(type, 'serviceId'),
      type: 'reference',
      reference: 'code_report_service',
      operators: OPERATORS.reference,
    },
    { key: 'name', label: fieldLabel(type, 'name'), type: 'string', operators: OPERATORS.string },
    {
      key: 'cause',
      label: fieldLabel(type, 'cause'),
      type: 'enum',
      options: enumOptions('monitoringCause', MONITORING_CAUSES),
      operators: OPERATORS.enum,
    },
    {
      key: 'httpStatus',
      label: fieldLabel(type, 'httpStatus'),
      type: 'number',
      operators: OPERATORS.number,
    },
  ] as const;
}

export const monitoringEvents: EventDefinitions<MonitoringEvent> = {
  [DOWN]: {
    link: (context) => projectPath(context, `/monitoring/monitors/${context.payload.monitorId}`),
    mailSummary: ({ name, cause, httpStatus }) => ({
      key: 'alerts.email.summary.monitorDown',
      values: { name, cause: httpStatus ?? cause ?? '' },
    }),
    ...eventText(DOWN),
    module: 'monitoring',
    scope: 'project',
    readPermission: READ_MONITORS,
    alertable: true,
    fields: fields(DOWN),
  },
  [DEGRADED]: {
    link: (context) => projectPath(context, `/monitoring/monitors/${context.payload.monitorId}`),
    mailSummary: ({ name }) => ({ key: 'alerts.email.summary.monitorDegraded', values: { name } }),
    ...eventText(DEGRADED),
    module: 'monitoring',
    scope: 'project',
    readPermission: READ_MONITORS,
    alertable: true,
    fields: fields(DEGRADED),
  },
  [RECOVERED]: {
    link: (context) => projectPath(context, `/monitoring/monitors/${context.payload.monitorId}`),
    mailSummary: ({ name, durationSeconds }) => ({
      key: 'alerts.email.summary.monitorRecovered',
      values: { name, minutes: Math.max(1, Math.round((durationSeconds ?? 0) / 60)) },
    }),
    ...eventText(RECOVERED),
    module: 'monitoring',
    scope: 'project',
    readPermission: READ_MONITORS,
    alertable: true,
    fields: [
      ...fields(RECOVERED),
      {
        key: 'durationSeconds',
        label: fieldLabel(RECOVERED, 'durationSeconds'),
        type: 'number',
        operators: OPERATORS.number,
      },
    ],
  },
};
