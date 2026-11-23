import type { Logger } from 'pino';
import { getEventDefinition, isEventType, type EventDefinition } from '#lib/events/catalog';
import type { AnyDomainEvent, EventBus, Unsubscribe } from '#lib/server/events';
import type { AlertDomain } from '../domain/alert.domain';
import { matches } from '../domain/condition-evaluator';
import {
  getSystemNotification,
  type SystemNotificationKind,
} from '../domain/system-notifications.data';
import type { AlertRepositoryPort } from '../infrastructure/repositories/alert.repository';
import { AlertThrottle } from './alert-throttle';
import { RecipientResolver, type Recipient } from './recipient-resolver';
import { eventContext, type AlertDirectory, type ResolvedNames } from './types';

export type AlertEmail = {
  recipient: Recipient;
  alert: Pick<AlertDomain, 'id' | 'name' | 'description' | 'scope'>;
  event: AnyDomainEvent;
  definition: EventDefinition;
  /** Matching events skipped by the throttle since the previous email. */
  suppressed: number;
  /** Display names of the ids the event references (services, projects, users…). */
  names: ReadonlyMap<string, string>;
  /** Names and slugs of where the event happened, for the texts and the links. */
  where: ResolvedNames;
};

export type SystemEmail = {
  recipient: Recipient;
  kind: SystemNotificationKind;
  event: AnyDomainEvent;
  names: ResolvedNames;
};

export interface AlertNotifierPort {
  sendAlert(email: AlertEmail): Promise<void>;
  sendSystemNotification(email: SystemEmail): Promise<void>;
}

export type AlertEngineOptions = {
  repository: Pick<AlertRepositoryPort, 'listEnabledByEventType'>;
  directory: AlertDirectory;
  recipients: RecipientResolver;
  notifier: AlertNotifierPort;
  throttle?: AlertThrottle;
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>;
  /** How long alerts of one event type stay cached; GitDB sync changes show up after this. */
  cacheTtlMs?: number;
  now?: () => number;
  /** `false` when no email can be sent (SMTP not configured): events are then ignored. */
  deliveryEnabled?: () => boolean;
};

export type AlertDryRun = {
  matched: boolean;
  recipients: Recipient[];
  /** Selected users that would not get it because they can't read the event. */
  denied: string[];
};

const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * Bus subscriber (`'*'`) that sends the fixed system notifications and evaluates configured
 * alerts. Nothing here throws back to the bus: a failure is logged and, for one recipient, never
 * stops the others.
 */
export class AlertEngine {
  private readonly cache = new Map<string, { alerts: AlertDomain[]; expiresAt: number }>();
  private readonly throttle: AlertThrottle;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: AlertEngineOptions) {
    this.throttle = options.throttle ?? new AlertThrottle();
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  attach(bus: Pick<EventBus, 'subscribe'>): Unsubscribe {
    return bus.subscribe('*', (event) => this.handle(event));
  }

  /** Drops cached alerts; called by the alert service after every write. */
  invalidate(): void {
    this.cache.clear();
  }

  async handle(event: AnyDomainEvent): Promise<void> {
    if (!isEventType(event.type)) return;
    if (this.options.deliveryEnabled && !this.options.deliveryEnabled()) {
      this.options.logger.debug(
        { eventType: event.type, eventId: event.id },
        '[alerts] email is not configured, event skipped',
      );
      return;
    }
    const definition = getEventDefinition(event.type) as EventDefinition;

    // system notifications first: they don't depend on anyone configuring an alert
    await this.sendSystemNotification(event).catch((error) =>
      this.options.logger.error(
        { err: error, eventType: event.type, eventId: event.id },
        '[alerts] system notification failed',
      ),
    );

    if (!definition.alertable) return;

    const alerts = await this.alertsFor(event.type);
    for (const alert of alerts) {
      if (!alert.appliesTo(event.scope) || !matches(event, alert, definition)) continue;
      await this.fire(alert, event, definition).catch((error) =>
        this.options.logger.error(
          { err: error, alertId: alert.id, eventType: event.type, eventId: event.id },
          '[alerts] alert failed',
        ),
      );
    }
  }

  /**
   * Evaluates `alert` against `event` and tells who would get it, without sending anything or
   * touching the throttle (`POST /api/alerts/[id]/test`).
   */
  async dryRun(
    alert: Pick<AlertDomain, 'location' | 'scope' | 'match' | 'conditions' | 'recipients'> & {
      appliesTo: AlertDomain['appliesTo'];
    },
    event: Pick<AnyDomainEvent, 'type' | 'payload' | 'scope'>,
  ): Promise<AlertDryRun> {
    const definition = getEventDefinition(event.type) as EventDefinition;
    const matched = alert.appliesTo(event.scope) && matches(event, alert, definition);
    const context = eventContext(event.scope);
    if (!context) return { matched, recipients: [], denied: [] };
    const resolved = await this.options.recipients.resolve(
      alert.location,
      alert.recipients,
      definition.readPermission,
      context,
    );
    return { matched, ...resolved };
  }

  private async alertsFor(eventType: string): Promise<AlertDomain[]> {
    const cached = this.cache.get(eventType);
    if (cached && cached.expiresAt > this.now()) return cached.alerts;
    const alerts = await this.options.repository.listEnabledByEventType(eventType);
    this.cache.set(eventType, { alerts, expiresAt: this.now() + this.cacheTtlMs });
    return alerts;
  }

  private async fire(
    alert: AlertDomain,
    event: AnyDomainEvent,
    definition: EventDefinition,
  ): Promise<void> {
    const log = this.options.logger;
    const context = eventContext(event.scope);
    if (!context) return;

    const decision = this.throttle.acquire(alert.id, alert.throttleMinutes);
    if (!decision.send) {
      log.info(
        { alertId: alert.id, eventType: event.type, eventId: event.id, suppressed: true },
        '[alerts] alert suppressed by throttle',
      );
      return;
    }

    const { recipients, denied } = await this.options.recipients.resolve(
      alert.location,
      alert.recipients,
      definition.readPermission,
      context,
    );
    if (denied.length > 0) {
      log.debug(
        { alertId: alert.id, eventId: event.id, deniedUserIds: denied },
        '[alerts] recipients without read permission skipped',
      );
    }

    const names = await this.referenceNames(alert, definition).catch(
      () => new Map<string, string>(),
    );
    const where: ResolvedNames = await this.options.directory
      .resolveNames({
        organizationId: event.scope.organizationId,
        projectId: event.scope.projectId,
      })
      .catch(() => ({}));

    let sent = 0;
    // one email per recipient: addresses are never shared, and a failure only affects one person
    for (const recipient of recipients) {
      try {
        await this.options.notifier.sendAlert({
          recipient,
          alert,
          event,
          definition,
          suppressed: decision.suppressed,
          names,
          where,
        });
        sent += 1;
      } catch (error) {
        log.warn(
          { err: error, alertId: alert.id, eventId: event.id, userId: recipient.userId },
          '[alerts] email to recipient failed',
        );
      }
    }

    log.info(
      {
        alertId: alert.id,
        eventType: event.type,
        eventId: event.id,
        recipients: recipients.length,
        sent,
        previouslySuppressed: decision.suppressed,
      },
      '[alerts] alert fired',
    );
  }

  private async referenceNames(
    alert: AlertDomain,
    definition: EventDefinition,
  ): Promise<Map<string, string>> {
    const references = new Set(
      definition.fields.map((field) => field.reference).filter((reference) => !!reference),
    );
    const names = new Map<string, string>();
    for (const reference of references) {
      const options = await this.options.directory.listReferences(reference!, alert.location);
      for (const option of options) names.set(option.id, option.label);
    }
    return names;
  }

  private async sendSystemNotification(event: AnyDomainEvent): Promise<void> {
    const rule = getSystemNotification(event.type);
    if (!rule) return;
    const userId = (rule.recipient as (payload: unknown) => string | null)(event.payload);
    if (!userId) return;
    // the actor already knows what they just did
    if (event.actor.kind === 'user' && event.actor.userId === userId) return;

    const user = await this.options.directory.findUser(userId);
    if (!user || user.disabled || !user.email) return;

    const payload = event.payload as { roleId?: string | null };
    const names = await this.options.directory.resolveNames({
      organizationId: event.scope.organizationId,
      projectId: event.scope.projectId,
      roleId: payload.roleId ?? null,
    });

    await this.options.notifier.sendSystemNotification({
      recipient: { userId: user.userId, username: user.username, email: user.email },
      kind: rule.kind,
      event,
      names,
    });
    this.options.logger.info(
      { eventType: event.type, eventId: event.id, kind: rule.kind },
      '[alerts] system notification sent',
    );
  }
}
