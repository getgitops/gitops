/**
 * Data shapes of the alert pages, shared by the loaders (`#lib/server/alerts/page`) and the
 * components (`#lib/components/alerts`). Type-only: safe to import from the client.
 */
import type { EventDefinition, Operator } from '#lib/events/catalog';
import type { AlertRow, AlertScope } from '#modules/alerts/domain/alert.domain';

/** An alertable event as plain data: `derive` functions are dropped, `derived` marks them. */
export type CatalogField = Omit<EventDefinition['fields'][number], 'derive'> & {
  derived?: boolean;
};

export type CatalogEntry = Omit<EventDefinition, 'fields'> & { fields: CatalogField[] };

export type AlertOption = { id: string; label: string };

export type DraftCondition = {
  field: string;
  operator: Operator | '';
  value: string | number | string[];
};

/** The editor's form state; the server validates and normalizes it on save. */
export type AlertDraft = {
  name: string;
  description: string;
  enabled: boolean;
  eventType: string;
  match: 'all' | 'any';
  conditions: DraftCondition[];
  recipients: { userIds: string[]; roleIds: string[] };
  throttleMinutes: number;
};

type Shared = {
  basePath: string;
  scope: AlertScope;
  catalog: CatalogEntry[];
  /** Entities a `reference` field can point at, per reference kind. */
  referenceOptions: Record<string, AlertOption[]>;
  users: AlertOption[];
  roles: AlertOption[];
};

export type AlertListData = Shared & {
  alerts: AlertRow[];
  /** Organization alerts that also fire for this project (project pages only). */
  inherited: AlertRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type AlertEditorData = Shared & {
  alertId: string | null;
  draft: AlertDraft;
  canSave: boolean;
  canDelete: boolean;
};

export type AlertTestView = {
  matched: boolean;
  recipients: Array<{ userId: string; username: string }>;
  deniedCount: number;
  event: { type: string; payload: Record<string, unknown>; projectId: string | null };
};

/** What the editor's form actions return. */
export type AlertFormResult = {
  draft?: AlertDraft;
  error?: string;
  errors?: Record<string, string>;
  test?: AlertTestView;
} | null;

export type { AlertRow, AlertScope };
