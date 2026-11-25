export const EXTERNAL_RECIPIENT_STATUSES = [
  'pending',
  'verified',
  'unsubscribed',
  'blocked',
] as const;
export type ExternalRecipientStatus = (typeof EXTERNAL_RECIPIENT_STATUSES)[number];

export type ExternalRecipientRow = {
  id: string;
  organizationId: string;
  email: string;
  status: ExternalRecipientStatus;
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  blockedAt: string | null;
  verificationTokenHash: string | null;
  verificationExpiresAt: string | null;
  lastVerificationSentAt: string | null;
  unsubscribeVersion: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** What the API and the pages may show: never the token hash. */
export type ExternalRecipientView = Pick<
  ExternalRecipientRow,
  | 'id'
  | 'email'
  | 'status'
  | 'verifiedAt'
  | 'unsubscribedAt'
  | 'blockedAt'
  | 'lastVerificationSentAt'
  | 'createdAt'
>;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

/**
 * An email address outside GitOps that alerts of one organization may send to. It is shared by
 * the organization's alerts, so the address confirms once and one unsubscribe stops every alert
 * of the organization.
 *
 * - `pending`: added, waiting for the owner to confirm the link.
 * - `verified`: confirmed, receives alerts.
 * - `unsubscribed`: the owner used an unsubscribe link.
 * - `blocked`: its domain is no longer allowed by the organization.
 *
 * Only `verified` receives. Blocking keeps `verifiedAt` / `unsubscribedAt`, so allowing the domain
 * again puts the address back where it was.
 */
export class ExternalRecipientDomain implements ExternalRecipientRow {
  id: string;
  organizationId: string;
  email: string;
  status: ExternalRecipientStatus;
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  blockedAt: string | null;
  verificationTokenHash: string | null;
  verificationExpiresAt: string | null;
  lastVerificationSentAt: string | null;
  unsubscribeVersion: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.organizationId = row.organizationId;
    this.email = row.email;
    this.status = (EXTERNAL_RECIPIENT_STATUSES as readonly string[]).includes(row.status)
      ? row.status
      : 'pending';
    this.verifiedAt = toIso(row.verifiedAt);
    this.unsubscribedAt = toIso(row.unsubscribedAt);
    this.blockedAt = toIso(row.blockedAt);
    this.verificationTokenHash = row.verificationTokenHash ?? null;
    this.verificationExpiresAt = toIso(row.verificationExpiresAt);
    this.lastVerificationSentAt = toIso(row.lastVerificationSentAt);
    this.unsubscribeVersion = Number.isInteger(Number(row.unsubscribeVersion))
      ? Number(row.unsubscribeVersion)
      : 0;
    this.createdByUserId = row.createdByUserId;
    this.createdAt = toIso(row.createdAt) ?? new Date(0).toISOString();
    this.updatedAt = toIso(row.updatedAt) ?? this.createdAt;
  }

  get canReceive(): boolean {
    return this.status === 'verified';
  }

  /** Status once its domain is allowed again: where it was before being blocked. */
  get unblockedStatus(): ExternalRecipientStatus {
    if (this.unsubscribedAt) return 'unsubscribed';
    return this.verifiedAt ? 'verified' : 'pending';
  }

  toView(): ExternalRecipientView {
    return {
      id: this.id,
      email: this.email,
      status: this.status,
      verifiedAt: this.verifiedAt,
      unsubscribedAt: this.unsubscribedAt,
      blockedAt: this.blockedAt,
      lastVerificationSentAt: this.lastVerificationSentAt,
      createdAt: this.createdAt,
    };
  }

  toJson(): ExternalRecipientRow {
    return {
      id: this.id,
      organizationId: this.organizationId,
      email: this.email,
      status: this.status,
      verifiedAt: this.verifiedAt,
      unsubscribedAt: this.unsubscribedAt,
      blockedAt: this.blockedAt,
      verificationTokenHash: this.verificationTokenHash,
      verificationExpiresAt: this.verificationExpiresAt,
      lastVerificationSentAt: this.lastVerificationSentAt,
      unsubscribeVersion: this.unsubscribeVersion,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/** Why an address can't be added; the alert editor maps them to `alerts.errors.<code>`. */
export type ExternalEmailError = 'invalid_email' | 'domain_not_allowed';

export class NotificationSettingsValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super(`Invalid notification settings: ${Object.keys(errors).join(', ')}`);
    this.name = 'NotificationSettingsValidationError';
  }
}

export class ExternalRecipientNotFoundError extends Error {
  constructor(id: string) {
    super(`External recipient not found: ${id}`);
    this.name = 'ExternalRecipientNotFoundError';
  }
}

/** The address is not in a status that allows the operation (resending to a verified one…). */
export class ExternalRecipientStateError extends Error {
  constructor(readonly status: ExternalRecipientStatus) {
    super(`External recipient is ${status}`);
    this.name = 'ExternalRecipientStateError';
  }
}

/** Too many verification emails for the address or the organization; retry later. */
export class VerificationRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Too many verification emails, try again later');
    this.name = 'VerificationRateLimitedError';
  }
}

/** A verification or unsubscribe link that is unknown, already used or expired. */
export class InvalidNotificationLinkError extends Error {
  constructor(readonly reason: 'invalid' | 'expired') {
    super(`Notification link ${reason}`);
    this.name = 'InvalidNotificationLinkError';
  }
}
