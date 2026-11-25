import { RateLimiter } from '#lib/server/infra/rate-limit';
import {
  createOneTimeToken,
  hashToken,
  isTokenAlive,
  signToken,
  verifySignedToken,
} from '#lib/server/infra/tokens';
import { emailDomain, isDomainAllowed, normalizeEmail } from '../domain/email-address';
import {
  ExternalRecipientDomain,
  ExternalRecipientNotFoundError,
  ExternalRecipientStateError,
  InvalidNotificationLinkError,
  VerificationRateLimitedError,
  type ExternalEmailError,
  type ExternalRecipientStatus,
  type ExternalRecipientView,
} from '../domain/external-recipient.domain';
import type {
  ExternalRecipientChanges,
  ExternalRecipientRepositoryPort,
} from '../infrastructure/repositories/external-recipient.repository';
import type { NotificationSettingsRepositoryPort } from '../infrastructure/repositories/notification-settings.repository';

export type VerificationEmail = {
  email: string;
  organizationId: string;
  verifyUrl: string;
  expiresAt: string;
};

export interface ExternalRecipientNotifierPort {
  /** Sent right away, not through the mail queue: the link carries a token. */
  sendVerification(email: VerificationEmail): Promise<void>;
}

/** Public paths of the links; made absolute by `absoluteUrl` (`null` without `ORIGIN`). */
export const VERIFY_PATH = '/notifications/verify';
export const UNSUBSCRIBE_PATH = '/notifications/unsubscribe';

const UNSUBSCRIBE_PURPOSE = 'notifications.unsubscribe';
const DAY_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_TTL_MS = 7 * DAY_MS;
/** Life of the unsubscribe link of an email; an old email's link then shows "expired". */
export const UNSUBSCRIBE_TTL_MS = 90 * DAY_MS;
/** Addresses one alert (and one call) may carry. */
export const MAX_EXTERNAL_EMAILS = 50;

export type ExternalRecipientServiceOptions = {
  /** HMAC secret of the unsubscribe links (`GITDB_ENCRYPTION_KEY`). */
  secret: () => string;
  /** Absolute URL of an app path, or `null` when `ORIGIN` is not set. */
  absoluteUrl: (path: string) => string | null;
  now?: () => Date;
  generateId?: () => string;
  /** Verification emails per address (any organization). */
  perAddressLimiter?: RateLimiter;
  /** Verification emails per organization. */
  perOrganizationLimiter?: RateLimiter;
  logger?: { warn: (object: object, message: string) => void };
};

export type DeliverableRecipient = { email: string; unsubscribeUrl: string };

export type ExternalEmailCheck = {
  /** The valid addresses, normalized and without duplicates. */
  emails: string[];
  /** `<index in the input>` → error code. */
  errors: Record<number, ExternalEmailError>;
};

/**
 * External email recipients of an organization's alerts: allowed-domain checks, the
 * confirmation link (random token, stored hashed, 7 days, single use), the unsubscribe link
 * (stateless HMAC token, single use through `unsubscribeVersion`) and the list of addresses an
 * alert may actually email right now.
 */
export class ExternalRecipientService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly perAddress: RateLimiter;
  private readonly perOrganization: RateLimiter;

  constructor(
    private readonly repository: ExternalRecipientRepositoryPort,
    private readonly settings: Pick<NotificationSettingsRepositoryPort, 'get'>,
    private readonly notifier: ExternalRecipientNotifierPort,
    private readonly options: ExternalRecipientServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    const clock = () => this.now().getTime();
    this.perAddress =
      options.perAddressLimiter ?? new RateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }, clock);
    this.perOrganization =
      options.perOrganizationLimiter ??
      new RateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }, clock);
  }

  /** Normalizes `emails` and tells which are invalid or outside the allowed domains. */
  async check(organizationId: string, emails: readonly unknown[]): Promise<ExternalEmailCheck> {
    const { allowedExternalEmailDomains: allowed } = await this.settings.get(organizationId);
    const valid = new Set<string>();
    const errors: Record<number, ExternalEmailError> = {};
    emails.forEach((raw, index) => {
      const email = normalizeEmail(raw);
      if (!email) errors[index] = 'invalid_email';
      else if (!isDomainAllowed(emailDomain(email), allowed)) errors[index] = 'domain_not_allowed';
      else valid.add(email);
    });
    return { emails: [...valid], errors };
  }

  async list(organizationId: string): Promise<ExternalRecipientView[]> {
    const recipients = await this.repository.listByOrganization(organizationId);
    return recipients.map((recipient) => recipient.toView());
  }

  /** Status of each address in the organization (`missing` when it was never added). */
  async statuses(
    organizationId: string,
    emails: readonly string[],
  ): Promise<Map<string, ExternalRecipientStatus | 'missing'>> {
    const recipients = await this.repository.listByOrganization(organizationId);
    const byEmail = new Map(recipients.map((recipient) => [recipient.email, recipient.status]));
    return new Map(emails.map((email) => [email, byEmail.get(email) ?? 'missing']));
  }

  /**
   * Makes sure every address exists for the organization, creating the missing ones as
   * `pending`, and sends the confirmation email to pending addresses without a live link. Call
   * it after the alert using them was saved; addresses must have passed `check()`. A failed or
   * rate-limited email leaves the address pending (it can be resent from the settings page)
   * and never throws.
   */
  async register(organizationId: string, emails: readonly string[], actorUserId: string) {
    const { allowedExternalEmailDomains: allowed } = await this.settings.get(organizationId);
    for (const raw of emails) {
      const email = normalizeEmail(raw);
      if (!email || !isDomainAllowed(emailDomain(email), allowed)) continue;
      let recipient = await this.repository.findByEmail(organizationId, email);
      if (!recipient) {
        const timestamp = this.now().toISOString();
        const row = new ExternalRecipientDomain({
          id: this.generateId(),
          organizationId,
          email,
          status: 'pending',
          unsubscribeVersion: 0,
          createdByUserId: actorUserId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).toJson();
        await this.repository.create(row);
        recipient = new ExternalRecipientDomain(row);
      }
      const linkAlive = isTokenAlive(recipient.verificationExpiresAt, this.now().getTime());
      if (recipient.status !== 'pending' || linkAlive) {
        continue;
      }
      await this.sendVerification(recipient).catch((error) => {
        this.options.logger?.warn(
          {
            recipientId: recipient.id,
            organizationId,
            reason: error instanceof Error ? error.name : 'unknown',
          },
          '[notifications] verification email not sent',
        );
      });
    }
  }

  /**
   * Sends a new confirmation link to a `pending` or `unsubscribed` address (the owner has to
   * click it again to resubscribe). Rate limited per address and per organization.
   */
  async resendVerification(organizationId: string, id: string): Promise<ExternalRecipientView> {
    const recipient = await this.repository.findById(id);
    if (!recipient || recipient.organizationId !== organizationId) {
      throw new ExternalRecipientNotFoundError(id);
    }
    if (recipient.status !== 'pending' && recipient.status !== 'unsubscribed') {
      throw new ExternalRecipientStateError(recipient.status);
    }
    await this.sendVerification(recipient);
    return (await this.repository.findById(id))!.toView();
  }

  /** Deletes a `pending` address (added by mistake): its confirmation link stops working. */
  async remove(organizationId: string, id: string): Promise<ExternalRecipientView> {
    const recipient = await this.repository.findById(id);
    if (!recipient || recipient.organizationId !== organizationId) {
      throw new ExternalRecipientNotFoundError(id);
    }
    if (recipient.status !== 'pending') {
      throw new ExternalRecipientStateError(recipient.status);
    }
    await this.repository.delete(id);
    return recipient.toView();
  }

  /** What a confirmation link points at, without using it (the GET page). */
  async inspectVerification(token: string): Promise<ExternalRecipientDomain> {
    const value = token.trim();
    const recipient = value
      ? await this.repository.findByVerificationTokenHash(hashToken(value))
      : null;
    if (!recipient) throw new InvalidNotificationLinkError('invalid');
    if (!isTokenAlive(recipient.verificationExpiresAt, this.now().getTime())) {
      throw new InvalidNotificationLinkError('expired');
    }
    return recipient;
  }

  /** Confirms the address. The link works once: its hash is cleared. */
  async verify(token: string): Promise<ExternalRecipientDomain> {
    const recipient = await this.inspectVerification(token);
    const timestamp = this.now().toISOString();
    const changes: ExternalRecipientChanges = {
      verifiedAt: timestamp,
      unsubscribedAt: null,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      // a blocked address keeps waiting for its domain; the consent is recorded meanwhile
      status: recipient.status === 'blocked' ? 'blocked' : 'verified',
    };
    await this.repository.update(recipient.id, changes);
    return new ExternalRecipientDomain({ ...recipient.toJson(), ...changes });
  }

  /** Unsubscribe link for an email to `recipient`; `null` without `ORIGIN`. */
  unsubscribeUrl(recipient: Pick<ExternalRecipientDomain, 'id' | 'unsubscribeVersion'>) {
    const token = signToken(
      UNSUBSCRIBE_PURPOSE,
      { rid: recipient.id, v: recipient.unsubscribeVersion },
      { secret: this.options.secret(), ttlMs: UNSUBSCRIBE_TTL_MS, now: this.now().getTime() },
    );
    return this.options.absoluteUrl(`${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`);
  }

  /** What an unsubscribe link points at, without using it (the GET page). */
  async inspectUnsubscribe(token: string): Promise<ExternalRecipientDomain> {
    const payload = verifySignedToken<{ rid?: unknown; v?: unknown }>(UNSUBSCRIBE_PURPOSE, token, {
      secret: this.options.secret(),
      now: this.now().getTime(),
    });
    if (!payload) {
      // tell an expired link apart only when the signature is ours
      const stale = verifySignedToken(UNSUBSCRIBE_PURPOSE, token, {
        secret: this.options.secret(),
        now: 0,
      });
      throw new InvalidNotificationLinkError(stale ? 'expired' : 'invalid');
    }
    const recipient =
      typeof payload.rid === 'string' ? await this.repository.findById(payload.rid) : null;
    // the version moves on every unsubscribe: a used link no longer matches
    if (!recipient || payload.v !== recipient.unsubscribeVersion) {
      throw new InvalidNotificationLinkError('invalid');
    }
    return recipient;
  }

  async unsubscribe(token: string): Promise<ExternalRecipientDomain> {
    const recipient = await this.inspectUnsubscribe(token);
    const changes: ExternalRecipientChanges = {
      status: recipient.status === 'blocked' ? 'blocked' : 'unsubscribed',
      unsubscribedAt: this.now().toISOString(),
      unsubscribeVersion: recipient.unsubscribeVersion + 1,
      verificationTokenHash: null,
      verificationExpiresAt: null,
    };
    await this.repository.update(recipient.id, changes);
    return new ExternalRecipientDomain({ ...recipient.toJson(), ...changes });
  }

  /**
   * The addresses of `emails` an alert of the organization may email now: verified, with an
   * allowed domain, and with an unsubscribe link (none are returned without `ORIGIN`).
   */
  async deliverable(
    organizationId: string,
    emails: readonly string[],
  ): Promise<DeliverableRecipient[]> {
    if (emails.length === 0) return [];
    const [{ allowedExternalEmailDomains: allowed }, recipients] = await Promise.all([
      this.settings.get(organizationId),
      this.repository.listByOrganization(organizationId),
    ]);
    const wanted = new Set(emails);
    const result: DeliverableRecipient[] = [];
    for (const recipient of recipients) {
      if (!wanted.has(recipient.email) || !recipient.canReceive) continue;
      if (!isDomainAllowed(emailDomain(recipient.email), allowed)) continue;
      const unsubscribeUrl = this.unsubscribeUrl(recipient);
      if (unsubscribeUrl) result.push({ email: recipient.email, unsubscribeUrl });
    }
    return result;
  }

  /**
   * Blocks the addresses whose domain is no longer allowed and gives the others back the status
   * they had before being blocked. Called whenever the allowed domains change.
   */
  async applyDomainPolicy(organizationId: string, allowed: readonly string[]) {
    const recipients = await this.repository.listByOrganization(organizationId);
    let blocked = 0;
    let restored = 0;
    for (const recipient of recipients) {
      const isAllowed = isDomainAllowed(emailDomain(recipient.email), allowed);
      if (!isAllowed && recipient.status !== 'blocked') {
        await this.repository.update(recipient.id, {
          status: 'blocked',
          blockedAt: this.now().toISOString(),
        });
        blocked += 1;
      } else if (isAllowed && recipient.status === 'blocked') {
        await this.repository.update(recipient.id, {
          status: recipient.unblockedStatus,
          blockedAt: null,
        });
        restored += 1;
      }
    }
    return { blocked, restored };
  }

  private async sendVerification(recipient: ExternalRecipientDomain): Promise<void> {
    const addressKey = recipient.email;
    const organizationKey = recipient.organizationId;
    const byAddress = this.perAddress.check(addressKey);
    const byOrganization = this.perOrganization.check(organizationKey);
    if (!byAddress.allowed || !byOrganization.allowed) {
      const retryAfterMs = Math.max(
        byAddress.allowed ? 0 : byAddress.retryAfterMs,
        byOrganization.allowed ? 0 : byOrganization.retryAfterMs,
      );
      throw new VerificationRateLimitedError(retryAfterMs);
    }

    const link = createOneTimeToken(VERIFICATION_TTL_MS, this.now());
    const verifyUrl = this.options.absoluteUrl(
      `${VERIFY_PATH}?token=${encodeURIComponent(link.token)}`,
    );
    if (!verifyUrl) throw new Error('ORIGIN is not set: verification links cannot be built');

    this.perAddress.consume(addressKey);
    this.perOrganization.consume(organizationKey);
    // a new link replaces the previous one, which stops working
    await this.repository.update(recipient.id, {
      verificationTokenHash: link.hash,
      verificationExpiresAt: link.expiresAt,
      lastVerificationSentAt: this.now().toISOString(),
    });
    await this.notifier.sendVerification({
      email: recipient.email,
      organizationId: recipient.organizationId,
      verifyUrl,
      expiresAt: link.expiresAt,
    });
  }
}
