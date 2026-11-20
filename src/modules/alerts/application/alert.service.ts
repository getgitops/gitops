import {
  getEventDefinition,
  isEventType,
  listAlertFields,
  type EventDefinition,
  type EventFieldDefinition,
} from '#lib/events/catalog';
import type { EventType } from '#lib/events/domain-events';
import {
  ALERT_CHANNELS,
  ALERT_MATCHES,
  AlertDomain,
  AlertNotFoundError,
  AlertValidationError,
  MAX_THROTTLE_MINUTES,
  type AlertChannel,
  type AlertCondition,
  type AlertFields,
  type AlertInput,
  type AlertLocation,
  type AlertMatch,
  type AlertRecipients,
  type AlertValidationErrors,
} from '../domain/alert.domain';
import type { AlertRepositoryPort } from '../infrastructure/repositories/alert.repository';
import {
  locationContext,
  type AlertActor,
  type AlertDirectory,
  type ReferenceOption,
} from './types';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CONDITIONS = 20;
const MAX_LIST_VALUES = 100;

const VALUELESS_OPERATORS = new Set(['is_true', 'is_false', 'exists']);
const LIST_OPERATORS = new Set(['in', 'not_in']);

export type AlertServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  /** Called after every successful write, so the engine drops its cached alerts. */
  onChange?: () => void;
};

/** Ids the location's reference lists contain, loaded once per validation. */
type ReferenceCache = Map<string, Promise<ReferenceOption[]>>;

/**
 * CRUD of alerts. Every write is validated against the event catalog and the location: the event
 * must be alertable from that scope, conditions must use the event's fields with valid operators
 * and values, references and recipients must belong to the location, and the actor must be able
 * to read the event themselves (anti-escalation).
 */
export class AlertService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly onChange: () => void;

  constructor(
    private readonly repository: AlertRepositoryPort,
    private readonly directory: AlertDirectory,
    options: AlertServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.onChange = options.onChange ?? (() => {});
  }

  async get(id: string): Promise<AlertDomain> {
    const alert = await this.repository.findById(id);
    if (!alert) throw new AlertNotFoundError(id);
    return alert;
  }

  /** The location's own alerts: organization-level ones, or one project's. */
  async list(
    location: Pick<AlertLocation, 'organizationId' | 'projectId'>,
  ): Promise<AlertDomain[]> {
    if (location.projectId) return this.repository.listByProject(location.projectId);
    const alerts = await this.repository.listByOrganization(location.organizationId);
    return alerts.filter((alert) => alert.scope === 'organization');
  }

  /**
   * Organization alerts that can fire for events of `projectId`: those on project events whose
   * `projectId` conditions don't rule the project out.
   */
  async listInherited(organizationId: string, projectId: string): Promise<AlertDomain[]> {
    const alerts = await this.list({ organizationId, projectId: null });
    return alerts.filter((alert) => {
      if (!isEventType(alert.eventType)) return false;
      if (getEventDefinition(alert.eventType).scope !== 'project') return false;
      const projectConditions = alert.conditions.filter(
        (condition) => condition.field === 'projectId',
      );
      if (projectConditions.length === 0 || alert.match === 'any') return true;
      return projectConditions.every((condition) => {
        const values = Array.isArray(condition.value) ? condition.value : [condition.value];
        if (condition.operator === 'eq' || condition.operator === 'in')
          return values.includes(projectId);
        if (condition.operator === 'neq' || condition.operator === 'not_in') {
          return !values.includes(projectId);
        }
        return true;
      });
    });
  }

  /** Validates `input` for `location` and returns the normalized fields, without saving. */
  async validate(
    location: AlertLocation,
    input: AlertInput,
    actor: AlertActor,
  ): Promise<AlertFields> {
    const errors: AlertValidationErrors = {};
    const references: ReferenceCache = new Map();

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) errors.name = 'required';
    else if (name.length > MAX_NAME_LENGTH) errors.name = 'too_long';

    const description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : null;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) errors.description = 'too_long';

    const enabled =
      input.enabled === undefined ? true : input.enabled === true || input.enabled === 'true';

    const match = (ALERT_MATCHES as readonly unknown[]).includes(input.match ?? 'all')
      ? ((input.match ?? 'all') as AlertMatch)
      : null;
    if (!match) errors.match = 'invalid';

    const definition = await this.validateEventType(location, input.eventType, actor, errors);

    const conditions = definition
      ? await this.validateConditions(location, definition, input.conditions, errors, references)
      : [];

    const recipients = await this.validateRecipients(location, input.recipients, errors);

    const channels = this.validateChannels(input.channels, errors);

    const throttleMinutes = Number(input.throttleMinutes ?? 0);
    if (
      !Number.isInteger(throttleMinutes) ||
      throttleMinutes < 0 ||
      throttleMinutes > MAX_THROTTLE_MINUTES
    ) {
      errors.throttleMinutes = 'invalid';
    }

    if (Object.keys(errors).length > 0 || !definition || !match) {
      throw new AlertValidationError(errors);
    }

    return {
      name,
      description,
      enabled,
      eventType: definition.type,
      match,
      conditions,
      recipients,
      channels,
      throttleMinutes,
    };
  }

  async create(
    location: AlertLocation,
    input: AlertInput,
    actor: AlertActor,
  ): Promise<AlertDomain> {
    const fields = await this.validate(location, input, actor);
    const timestamp = this.now().toISOString();
    const row = {
      id: this.generateId(),
      ...location,
      projectId: location.scope === 'project' ? location.projectId : null,
      ...fields,
      createdByUserId: actor.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.repository.create(row);
    this.onChange();
    return new AlertDomain(row);
  }

  /** Partial update: missing fields keep their stored value; the result is validated as a whole. */
  async update(id: string, input: AlertInput, actor: AlertActor): Promise<AlertDomain> {
    const current = await this.get(id);
    const merged: AlertInput = {
      name: current.name,
      description: current.description,
      enabled: current.enabled,
      eventType: current.eventType,
      match: current.match,
      conditions: current.conditions,
      recipients: current.recipients,
      channels: current.channels,
      throttleMinutes: current.throttleMinutes,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    };
    const fields = await this.validate(current.location, merged, actor);
    await this.repository.update(id, fields);
    this.onChange();
    return new AlertDomain({ ...current.toJson(), ...fields, updatedAt: this.now().toISOString() });
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
    this.onChange();
  }

  private async validateEventType(
    location: AlertLocation,
    value: unknown,
    actor: AlertActor,
    errors: AlertValidationErrors,
  ): Promise<EventDefinition | null> {
    if (typeof value !== 'string' || !value) {
      errors.eventType = 'required';
      return null;
    }
    if (!isEventType(value)) {
      errors.eventType = 'unknown_event';
      return null;
    }
    const definition = getEventDefinition(value as EventType) as EventDefinition;
    if (!definition.alertable) {
      errors.eventType = 'not_alertable';
      return null;
    }
    // project events can be watched from the project or its organization; organization events
    // only from the organization
    if (location.scope === 'project' && definition.scope === 'organization') {
      errors.eventType = 'scope_mismatch';
      return null;
    }
    if (!(await this.canReadEvent(location, definition, actor))) {
      errors.eventType = 'forbidden';
      return null;
    }
    return definition;
  }

  /**
   * Anti-escalation: an alert must not tell its author about events they can't see. In an
   * organization, a project permission is also satisfied by `organization:projects:read`, the
   * same grant that cascades into every project.
   */
  private async canReadEvent(
    location: AlertLocation,
    definition: EventDefinition,
    actor: AlertActor,
  ): Promise<boolean> {
    const context = locationContext(location);
    if (await actor.canRead(definition.readPermission, context)) return true;
    return (
      context.scope === 'organization' &&
      definition.scope === 'project' &&
      definition.readPermission.startsWith('project:') &&
      actor.canRead('organization:projects:read', context)
    );
  }

  private async validateConditions(
    location: AlertLocation,
    definition: EventDefinition,
    value: unknown,
    errors: AlertValidationErrors,
    references: ReferenceCache,
  ): Promise<AlertCondition[]> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      errors.conditions = 'invalid';
      return [];
    }
    if (value.length > MAX_CONDITIONS) {
      errors.conditions = 'too_many';
      return [];
    }

    const fields = listAlertFields(definition, location.scope);
    const conditions: AlertCondition[] = [];

    for (const [index, raw] of value.entries()) {
      const prefix = `conditions.${index}`;
      const candidate = (raw ?? {}) as Record<string, unknown>;
      const field = fields.find((item) => item.key === candidate.field);
      if (!field) {
        errors[`${prefix}.field`] = 'unknown_field';
        continue;
      }
      const operator = candidate.operator;
      if (
        typeof operator !== 'string' ||
        !(field.operators as readonly string[]).includes(operator)
      ) {
        errors[`${prefix}.operator`] = 'invalid_operator';
        continue;
      }
      const condition = { field: field.key as string, operator } as AlertCondition;
      const result = await this.normalizeValue(
        location,
        field,
        condition,
        candidate.value,
        references,
      );
      if (typeof result === 'string') {
        errors[`${prefix}.value`] = result;
        continue;
      }
      if (result.value !== undefined) condition.value = result.value;
      conditions.push(condition);
    }

    return conditions;
  }

  /** The stored value for a condition, or the error code. */
  private async normalizeValue(
    location: AlertLocation,
    field: EventFieldDefinition,
    condition: AlertCondition,
    raw: unknown,
    references: ReferenceCache,
  ): Promise<{ value: AlertCondition['value'] } | string> {
    if (VALUELESS_OPERATORS.has(condition.operator)) return { value: undefined };

    if (LIST_OPERATORS.has(condition.operator)) {
      const items = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
      if (items.length === 0) return 'required';
      if (items.length > MAX_LIST_VALUES) return 'too_many';
      const normalized: string[] = [];
      for (const item of items) {
        const result = await this.normalizeScalar(location, field, item, references);
        if (typeof result === 'string') return result;
        normalized.push(String(result.value));
      }
      return { value: [...new Set(normalized)] };
    }

    return this.normalizeScalar(location, field, raw, references);
  }

  private async normalizeScalar(
    location: AlertLocation,
    field: EventFieldDefinition,
    raw: unknown,
    references: ReferenceCache,
  ): Promise<{ value: string | number } | string> {
    if (raw === undefined || raw === null || raw === '') return 'required';

    switch (field.type) {
      case 'number': {
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? { value: parsed } : 'invalid';
      }
      case 'date': {
        const parsed = typeof raw === 'string' ? Date.parse(raw) : NaN;
        return Number.isNaN(parsed) ? 'invalid' : { value: new Date(parsed).toISOString() };
      }
      case 'enum': {
        const allowed = (field.options ?? []).map((option) => option.value);
        return typeof raw === 'string' && allowed.includes(raw) ? { value: raw } : 'unknown_option';
      }
      case 'reference': {
        if (typeof raw !== 'string' || !field.reference) return 'invalid';
        const key = field.reference;
        if (!references.has(key)) {
          references.set(key, this.directory.listReferences(field.reference, location));
        }
        const options = await references.get(key)!;
        return options.some((option) => option.id === raw) ? { value: raw } : 'unknown_reference';
      }
      case 'string': {
        if (typeof raw !== 'string' || !raw.trim()) return 'required';
        return { value: raw.trim() };
      }
      default:
        return 'invalid';
    }
  }

  private async validateRecipients(
    location: AlertLocation,
    value: unknown,
    errors: AlertValidationErrors,
  ): Promise<AlertRecipients> {
    const raw = (value ?? {}) as Record<string, unknown>;
    const ids = (list: unknown) =>
      Array.isArray(list)
        ? [...new Set(list.filter((id): id is string => typeof id === 'string' && !!id))]
        : [];
    const userIds = ids(raw.userIds);
    const roleIds = ids(raw.roleIds);

    if (userIds.length === 0 && roleIds.length === 0) {
      errors.recipients = 'required';
      return { userIds, roleIds };
    }

    if (userIds.length > 0) {
      const members = new Set((await this.directory.listMembers(location)).map((m) => m.userId));
      if (userIds.some((id) => !members.has(id))) errors['recipients.userIds'] = 'unknown_user';
    }
    if (roleIds.length > 0) {
      const roles = new Set((await this.directory.listRoles(location)).map((role) => role.id));
      if (roleIds.some((id) => !roles.has(id))) errors['recipients.roleIds'] = 'unknown_role';
    }

    return { userIds, roleIds };
  }

  private validateChannels(value: unknown, errors: AlertValidationErrors): AlertChannel[] {
    if (value === undefined || value === null) return ['mail'];
    const list = Array.isArray(value) ? value : [value];
    const valid = list.every((channel) => (ALERT_CHANNELS as readonly unknown[]).includes(channel));
    if (!valid || list.length === 0) {
      errors.channels = 'invalid_channel';
      return ['mail'];
    }
    return [...new Set(list as AlertChannel[])];
  }
}
