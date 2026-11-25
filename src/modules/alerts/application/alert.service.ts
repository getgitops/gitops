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
  emptyRecipients,
} from '../domain/alert.domain';
import type { AlertRepositoryPort } from '../infrastructure/repositories/alert.repository';
import {
  locationContext,
  type AlertActor,
  type AlertDirectory,
  type ExternalRecipientsPort,
  type ReferenceOption,
} from './types';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CONDITIONS = 20;
const MAX_LIST_VALUES = 100;
const MAX_TARGETS = 50;
export const MAX_EXTERNAL_EMAILS = MAX_TARGETS;

const SLACK_CHANNEL_PATTERN = /^#[a-z0-9][a-z0-9._-]{0,79}$/;
const MAX_SPACE_LENGTH = 128;

const VALUELESS_OPERATORS = new Set(['is_true', 'is_false', 'exists']);
const LIST_OPERATORS = new Set(['in', 'not_in']);

export type AlertServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  /** Called after every successful write, so the engine drops its cached alerts. */
  onChange?: () => void;
  externalRecipients?: ExternalRecipientsPort;
  logger?: { warn: (object: object, message: string) => void };
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
  private readonly externalRecipients: ExternalRecipientsPort | null;
  private readonly logger: AlertServiceOptions['logger'];

  constructor(
    private readonly repository: AlertRepositoryPort,
    private readonly directory: AlertDirectory,
    options: AlertServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.onChange = options.onChange ?? (() => {});
    this.externalRecipients = options.externalRecipients ?? null;
    this.logger = options.logger;
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

  async validate(
    location: AlertLocation,
    input: AlertInput,
    actor: AlertActor,
    previousEmails: readonly string[] = [],
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

    const channels = this.validateChannels(input.channels, errors);

    const recipients = await this.validateRecipients(
      location,
      input.recipients,
      channels,
      actor,
      previousEmails,
      errors,
    );

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
    await this.registerExternal(location, fields.recipients.emails, actor);
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
    const fields = await this.validate(current.location, merged, actor, current.recipients.emails);
    await this.repository.update(id, fields);
    this.onChange();
    await this.registerExternal(current.location, fields.recipients.emails, actor);
    return new AlertDomain({ ...current.toJson(), ...fields, updatedAt: this.now().toISOString() });
  }

  async registerExternal(
    location: AlertLocation,
    emails: readonly string[],
    actor: AlertActor,
  ): Promise<void> {
    if (!this.externalRecipients || emails.length === 0) return;
    try {
      await this.externalRecipients.register(location.organizationId, emails, actor.userId);
    } catch (error) {
      this.logger?.warn(
        { err: error, organizationId: location.organizationId },
        '[alerts] external recipients could not be registered',
      );
    }
  }

  /** Drops `email` from every alert of the organization (and of its projects) that has it. */
  async removeEmail(organizationId: string, email: string): Promise<number> {
    const alerts = await this.repository.listByOrganization(organizationId);
    const affected = alerts.filter((alert) => alert.recipients.emails.includes(email));
    for (const alert of affected) {
      await this.repository.update(alert.id, {
        recipients: {
          ...alert.recipients,
          emails: alert.recipients.emails.filter((candidate) => candidate !== email),
        },
      });
    }
    if (affected.length > 0) this.onChange();
    return affected.length;
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

  /**
   * Targets of every enabled channel; those of disabled channels are dropped. Each enabled
   * channel needs at least one target (`recipients` keeps its historical key for mail).
   */
  private async validateRecipients(
    location: AlertLocation,
    value: unknown,
    channels: AlertChannel[],
    actor: AlertActor,
    previousEmails: readonly string[],
    errors: AlertValidationErrors,
  ): Promise<AlertRecipients> {
    const raw = (value ?? {}) as Record<string, unknown>;
    const list = (key: string, normalize: (item: string) => string = (item) => item.trim()) =>
      Array.isArray(raw[key])
        ? [
            ...new Set(
              (raw[key] as unknown[])
                .filter((item): item is string => typeof item === 'string')
                .map(normalize)
                .filter(Boolean),
            ),
          ]
        : [];
    const recipients = emptyRecipients();
    const tooMany = (key: string, items: string[]) => {
      if (items.length > MAX_TARGETS) errors[`recipients.${key}`] = 'too_many';
    };

    if (channels.includes('mail')) {
      recipients.userIds = list('userIds');
      recipients.roleIds = list('roleIds');
      recipients.emails = await this.validateEmails(
        location,
        raw.emails,
        actor,
        previousEmails,
        errors,
      );
      const { userIds, roleIds, emails } = recipients;
      if (userIds.length === 0 && roleIds.length === 0 && emails.length === 0) {
        if (!errors['recipients.emails']) errors.recipients = 'required';
      }
      if (userIds.length > 0) {
        const members = new Set((await this.directory.listMembers(location)).map((m) => m.userId));
        if (userIds.some((id) => !members.has(id))) errors['recipients.userIds'] = 'unknown_user';
      }
      if (roleIds.length > 0) {
        const roles = new Set((await this.directory.listRoles(location)).map((role) => role.id));
        if (roleIds.some((id) => !roles.has(id))) errors['recipients.roleIds'] = 'unknown_role';
      }
    }

    if (channels.includes('slack')) {
      recipients.slackChannels = list('slackChannels', (item) => {
        const name = item.trim().toLowerCase();
        return name && !name.startsWith('#') ? `#${name}` : name;
      });
      if (recipients.slackChannels.length === 0) errors['recipients.slackChannels'] = 'required';
      else if (recipients.slackChannels.some((name) => !SLACK_CHANNEL_PATTERN.test(name))) {
        errors['recipients.slackChannels'] = 'invalid_slack_channel';
      }
      tooMany('slackChannels', recipients.slackChannels);
    }

    if (channels.includes('google_chat')) {
      recipients.googleChatSpaces = list('googleChatSpaces');
      if (recipients.googleChatSpaces.length === 0) {
        errors['recipients.googleChatSpaces'] = 'required';
      } else if (recipients.googleChatSpaces.some((space) => space.length > MAX_SPACE_LENGTH)) {
        errors['recipients.googleChatSpaces'] = 'too_long';
      }
      tooMany('googleChatSpaces', recipients.googleChatSpaces);
    }

    if (channels.includes('webhook')) {
      recipients.webhookUrls = list('webhookUrls');
      if (recipients.webhookUrls.length === 0) errors['recipients.webhookUrls'] = 'required';
      else if (recipients.webhookUrls.some((url) => !isHttpUrl(url))) {
        errors['recipients.webhookUrls'] = 'invalid_url';
      }
      tooMany('webhookUrls', recipients.webhookUrls);
    }

    return recipients;
  }

  private async validateEmails(
    location: AlertLocation,
    value: unknown,
    actor: AlertActor,
    previous: readonly string[],
    errors: AlertValidationErrors,
  ): Promise<string[]> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      errors['recipients.emails'] = 'invalid';
      return [];
    }
    const items = value.filter((item) => !(typeof item === 'string' && !item.trim()));
    if (items.length === 0) return [];
    if (items.length > MAX_EXTERNAL_EMAILS) {
      errors['recipients.emails'] = 'too_many';
      return [];
    }

    let emails: string[] = [];
    if (!this.externalRecipients) {
      errors['recipients.emails'] = 'domain_not_allowed';
    } else {
      const checked = await this.externalRecipients.check(location.organizationId, items);
      emails = checked.emails;
      const failures = Object.entries(checked.errors);
      for (const [index, code] of failures) errors[`recipients.emails.${index}`] = code;
      if (failures.length > 0) errors['recipients.emails'] = failures[0][1];
    }

    const known = new Set(previous);
    if (emails.some((email) => !known.has(email))) {
      const permission = `${location.scope}:notifications:update` as const;
      if (!(await actor.canRead(permission, locationContext(location)))) {
        errors['recipients.emails'] = 'forbidden_external';
      }
    }
    return emails;
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
