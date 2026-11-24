import type { Logger } from 'pino';
import { recipientHash } from '#lib/server/infra/notifications/mail-queue';
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
import {
  eventContext,
  type AlertDirectory,
  type ExternalRecipientsPort,
  type ResolvedNames,
} from './types';

/**
 * Who an alert email goes to: a member (filtered by cancan) or a verified external address,
 * whose email carries an unsubscribe link and leaves out what only members may see.
 */
export type AlertEmailRecipient =
  ({ kind: 'member' } & Recipient) | { kind: 'external'; email: string; unsubscribeUrl: string };

export type AlertEmail = {
  recipient: AlertEmailRecipient;
  alert: Pick<AlertDomain, 'id' | 'name' | 'description' | 'scope'>;
  event: AnyDomainEvent;
  definition: EventDefinition;
  /** Matching events skipped by the throttle since the previous email. */
  suppressed: number;
  /** Display names of the ids the event references (services, projects, users…). */
  names: ReadonlyMap<string, string>;
  /** Names and slugs of where the event happened, for the texts and the links. */
  where: ResolvedNames;
  /** Sent from the editor's "send test email" with an example event, not by a real event. */
  test?: boolean;
};

/** What a test send reached. */
export type AlertTestDelivery = {
  /** Emails handed to the notifier (members and verified external addresses). */
  sent: number;
  failed: number;
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
  recipients: Pick<RecipientResolver, 'resolve'>;
  /** Without it, the external addresses of alerts are ignored. */
  externalRecipients?: Pick<ExternalRecipientsPort, 'deliverable' | 'statuses'>;
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
  /** The alert's external addresses, their status and whether they would get it. */
  external: Array<{ email: string; status: string; delivers: boolean }>;
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
    if (!context) return { matched, recipients: [], denied: [], external: [] };
    const resolved = await this.options.recipients.resolve(
      alert.location,
      alert.recipients,
      definition.readPermission,
      context,
    );
    return { matched, ...resolved, external: await this.externalPreview(alert) };
  }

  private async externalPreview(alert: Pick<AlertDomain, 'location' | 'recipients'>) {
    const emails = alert.recipients.externalEmails;
    const port = this.options.externalRecipients;
    if (!port || emails.length === 0) return [];
    const organizationId = alert.location.organizationId;
    const [statuses, deliverable] = await Promise.all([
      port.statuses(organizationId, emails),
      port.deliverable(organizationId, emails),
    ]);
    const delivering = new Set(deliverable.map((recipient) => recipient.email));
    return emails.map((email) => ({
      email,
      status: statuses.get(email) ?? 'missing',
      delivers: delivering.has(email),
    }));
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

    const delivery = await this.deliver(alert, event, definition, decision.suppressed, false);
    log.info(
      {
        alertId: alert.id,
        eventType: event.type,
        eventId: event.id,
        ...delivery,
        previouslySuppressed: decision.suppressed,
      },
      '[alerts] alert fired',
    );
  }

  /**
   * Really emails the alert's recipients about `event` (an example built by the caller), with
   * the same rules as a real event: members that can read it and verified external addresses.
   * The throttle is neither checked nor touched.
   */
  async sendTest(
    alert: Pick<
      AlertDomain,
      'id' | 'name' | 'description' | 'scope' | 'organizationId' | 'location' | 'recipients'
    >,
    event: AnyDomainEvent,
  ): Promise<AlertTestDelivery> {
    const definition = getEventDefinition(event.type) as EventDefinition;
    const { sent, failed } = await this.deliver(alert, event, definition, 0, true);
    this.options.logger.info(
      { alertId: alert.id, eventType: event.type, sent, failed, test: true },
      '[alerts] test email sent',
    );
    return { sent, failed };
  }

  private async deliver(
    alert: Pick<
      AlertDomain,
      'id' | 'name' | 'description' | 'scope' | 'organizationId' | 'location' | 'recipients'
    >,
    event: AnyDomainEvent,
    definition: EventDefinition,
    suppressed: number,
    test: boolean,
  ): Promise<{ recipients: number; externalRecipients: number; sent: number; failed: number }> {
    const log = this.options.logger;
    const context = eventContext(event.scope);
    if (!context) return { recipients: 0, externalRecipients: 0, sent: 0, failed: 0 };

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

    // external addresses: no cancan (they have no account), only verified ones of an allowed
    // domain, and system notifications never reach them (they only come from `fire`)
    const external = await this.externalRecipientsOf(alert);

    const targets: AlertEmailRecipient[] = [
      ...recipients.map((recipient) => ({ kind: 'member' as const, ...recipient })),
      ...external.map((recipient) => ({ kind: 'external' as const, ...recipient })),
    ];

    let sent = 0;
    // one email per recipient: addresses are never shared, and a failure only affects one person
    for (const recipient of targets) {
      try {
        await this.options.notifier.sendAlert({
          recipient,
          alert,
          event,
          definition,
          suppressed,
          names,
          where,
          ...(test ? { test: true } : {}),
        });
        sent += 1;
      } catch (error) {
        log.warn(
          {
            err: error,
            alertId: alert.id,
            eventId: event.id,
            ...(recipient.kind === 'member'
              ? { userId: recipient.userId }
              : { recipient: recipientHash(recipient.email) }),
          },
          '[alerts] email to recipient failed',
        );
      }
    }

    return {
      recipients: recipients.length,
      externalRecipients: external.length,
      sent,
      failed: targets.length - sent,
    };
  }

  private async externalRecipientsOf(
    alert: Pick<AlertDomain, 'id' | 'organizationId' | 'recipients'>,
  ) {
    const port = this.options.externalRecipients;
    const emails = alert.recipients.externalEmails;
    if (!port || emails.length === 0) return [];
    try {
      return await port.deliverable(alert.organizationId, emails);
    } catch (error) {
      this.options.logger.warn(
        { err: error, alertId: alert.id },
        '[alerts] external recipients could not be resolved',
      );
      return [];
    }
  }

  private async referenceNames(
    alert: Pick<AlertDomain, 'location'>,
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
