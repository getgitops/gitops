import {
  SECURITY_POLICY_ENFORCEMENTS,
  SECURITY_POLICY_TYPES,
} from '#lib/code-report/security-policy';
import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';
import { projectPath } from './links';

/** Tools that report analyses: scanners plus the manual upload and the CI/CD API defaults. */
export const CODE_REPORT_TOOLS = [
  'trivy',
  'grype',
  'semgrep',
  'gitleaks',
  'trufflehog',
  'sbom',
  'syft',
  'coverage',
  'manual-upload',
  'api',
] as const;

const READ_REPORTS = 'project:codereport:reports:read';

const COMPLETED = 'code_report.analysis.completed';
const FAILED = 'code_report.analysis.failed';
const POLICY_VIOLATED = 'code_report.policy.violated';
const SERVICE_CREATED = 'code_report.service.created';
const SERVICE_DELETED = 'code_report.service.deleted';

function serviceField(type: typeof COMPLETED | typeof FAILED | typeof POLICY_VIOLATED) {
  return {
    key: 'serviceId',
    label: fieldLabel(type, 'serviceId'),
    type: 'reference',
    reference: 'code_report_service',
    operators: OPERATORS.reference,
  } as const;
}

function toolField(type: typeof COMPLETED | typeof FAILED | typeof POLICY_VIOLATED) {
  return {
    key: 'tool',
    label: fieldLabel(type, 'tool'),
    type: 'enum',
    options: enumOptions('tool', CODE_REPORT_TOOLS),
    operators: ['eq', 'neq', 'in'],
  } as const;
}

function branchField(type: typeof COMPLETED | typeof FAILED) {
  return {
    key: 'gitInfo.branch',
    label: fieldLabel(type, 'gitInfo.branch'),
    type: 'string',
    operators: OPERATORS.string,
  } as const;
}

function countField<K extends `summary.${'critical' | 'high' | 'medium' | 'low' | 'total'}`>(
  key: K,
) {
  return {
    key,
    label: fieldLabel(COMPLETED, key),
    type: 'number',
    operators: OPERATORS.number,
  } as const;
}

export const codeReportEvents: EventDefinitions<
  | typeof COMPLETED
  | typeof FAILED
  | typeof POLICY_VIOLATED
  | typeof SERVICE_CREATED
  | typeof SERVICE_DELETED
> = {
  [COMPLETED]: {
    mailTemplate: 'alert-code-report-analysis',
    link: (context) => projectPath(context, `/code-report/history/${context.payload.analysisId}`),
    mailSummary: ({ summary }) =>
      summary.total === 0
        ? { key: 'alerts.email.summary.noVulnerabilities' }
        : {
            key: 'alerts.email.summary.vulnerabilities',
            values: { critical: summary.critical, high: summary.high, total: summary.total },
          },
    ...eventText(COMPLETED),
    module: 'code_report',
    scope: 'project',
    readPermission: READ_REPORTS,
    alertable: true,
    fields: [
      serviceField(COMPLETED),
      toolField(COMPLETED),
      branchField(COMPLETED),
      countField('summary.critical'),
      countField('summary.high'),
      countField('summary.medium'),
      countField('summary.low'),
      countField('summary.total'),
      {
        key: 'hasVulnerabilities',
        label: fieldLabel(COMPLETED, 'hasVulnerabilities'),
        type: 'boolean',
        operators: OPERATORS.boolean,
        derive: (payload) => payload.summary.total > 0,
      },
      {
        key: 'policiesViolated',
        label: fieldLabel(COMPLETED, 'policiesViolated'),
        type: 'boolean',
        operators: OPERATORS.boolean,
        derive: (payload) => payload.policies.status === 'violated',
      },
    ],
  },
  [FAILED]: {
    mailTemplate: 'alert-code-report-analysis',
    link: (context) => projectPath(context, `/code-report/history/${context.payload.analysisId}`),
    mailSummary: ({ tool }) => ({ key: 'alerts.email.summary.analysisFailed', values: { tool } }),
    ...eventText(FAILED),
    module: 'code_report',
    scope: 'project',
    readPermission: READ_REPORTS,
    alertable: true,
    fields: [serviceField(FAILED), toolField(FAILED), branchField(FAILED)],
  },
  [POLICY_VIOLATED]: {
    link: (context) => projectPath(context, `/code-report/history/${context.payload.analysisId}`),
    mailSummary: ({ policyName, violations }) => ({
      key: 'alerts.email.summary.policyViolated',
      values: { policy: policyName, count: violations },
    }),
    ...eventText(POLICY_VIOLATED),
    module: 'code_report',
    scope: 'project',
    readPermission: READ_REPORTS,
    alertable: true,
    fields: [
      serviceField(POLICY_VIOLATED),
      {
        key: 'policyId',
        label: fieldLabel(POLICY_VIOLATED, 'policyId'),
        type: 'reference',
        reference: 'code_report_policy',
        operators: OPERATORS.reference,
      },
      {
        key: 'policyType',
        label: fieldLabel(POLICY_VIOLATED, 'policyType'),
        type: 'enum',
        options: enumOptions('policyType', SECURITY_POLICY_TYPES),
        operators: OPERATORS.enum,
      },
      {
        key: 'enforcement',
        label: fieldLabel(POLICY_VIOLATED, 'enforcement'),
        type: 'enum',
        options: enumOptions('enforcement', SECURITY_POLICY_ENFORCEMENTS),
        operators: OPERATORS.enum,
      },
    ],
  },
  [SERVICE_CREATED]: {
    link: (context) => projectPath(context, '/code-report/services'),
    ...eventText(SERVICE_CREATED),
    module: 'code_report',
    scope: 'project',
    readPermission: READ_REPORTS,
    alertable: true,
    fields: [
      {
        key: 'name',
        label: fieldLabel(SERVICE_CREATED, 'name'),
        type: 'string',
        operators: OPERATORS.string,
      },
    ],
  },
  [SERVICE_DELETED]: {
    link: (context) => projectPath(context, '/code-report/services'),
    ...eventText(SERVICE_DELETED),
    module: 'code_report',
    scope: 'project',
    readPermission: READ_REPORTS,
    alertable: true,
    fields: [
      {
        key: 'serviceId',
        label: fieldLabel(SERVICE_DELETED, 'serviceId'),
        type: 'reference',
        reference: 'code_report_service',
        operators: OPERATORS.reference,
      },
      {
        key: 'name',
        label: fieldLabel(SERVICE_DELETED, 'name'),
        type: 'string',
        operators: OPERATORS.string,
      },
    ],
  },
};
