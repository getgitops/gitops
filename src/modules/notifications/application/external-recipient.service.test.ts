import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '#lib/server/infra/tokens';
import {
  ExternalRecipientStateError,
  InvalidNotificationLinkError,
  NotificationSettingsValidationError,
  VerificationRateLimitedError,
} from '../domain/external-recipient.domain';
import { UNSUBSCRIBE_TTL_MS, VERIFICATION_TTL_MS } from './external-recipient.service';
import { createNotificationsFixture } from './testing';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const DAY = 24 * 60 * 60 * 1000;

type Fixture = ReturnType<typeof createNotificationsFixture>;

async function linkError(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(InvalidNotificationLinkError);
  return (error as InvalidNotificationLinkError).reason;
}

function tokenOf(url: string) {
  return new URL(url).searchParams.get('token')!;
}

describe('ExternalRecipientService', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = createNotificationsFixture();
    await f.settings.setAllowedDomains(ORG, ['partner.com', '*.client.io']);
  });

  describe('check', () => {
    it('normalizes valid addresses and reports invalid or not allowed ones by index', async () => {
      const result = await f.recipients.check(ORG, [
        'Ana@Partner.com',
        'not-an-email',
        'bob@evil.com',
        'eva@eu.client.io',
        'ana@partner.com',
        'root@client.io',
      ]);

      expect(result.emails).toEqual(['ana@partner.com', 'eva@eu.client.io']);
      expect(result.errors).toEqual({
        1: 'invalid_email',
        2: 'domain_not_allowed',
        5: 'domain_not_allowed',
      });
    });

    it('allows no external address while the list is empty (the default)', async () => {
      const result = await f.recipients.check(OTHER_ORG, ['ana@partner.com']);
      expect(result).toEqual({ emails: [], errors: { 0: 'domain_not_allowed' } });
    });
  });

  describe('verification', () => {
    it('creates pending recipients and sends one confirmation link each, stored hashed', async () => {
      await f.recipients.register(ORG, ['ana@partner.com', 'ana@partner.com'], 'admin');

      const [row] = f.recipientRepository.rows;
      expect(f.recipientRepository.rows).toHaveLength(1);
      expect(row).toMatchObject({ email: 'ana@partner.com', status: 'pending', verifiedAt: null });
      expect(f.notifier.sent).toHaveLength(1);
      const token = f.notifier.tokenFor('ana@partner.com');
      expect(f.notifier.sent[0].verifyUrl).toMatch(
        /^https:\/\/gitops\.example\.com\/notifications\/verify\?token=/,
      );
      expect(row.verificationTokenHash).toBe(hashToken(token));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(row.verificationExpiresAt).toBe(
        new Date(f.clock.now.getTime() + VERIFICATION_TTL_MS).toISOString(),
      );
    });

    it('does not send again while the link is alive, nor to addresses outside the domains', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      await f.recipients.register(ORG, ['ana@partner.com', 'bob@evil.com'], 'admin');

      expect(f.notifier.sent).toHaveLength(1);
      expect(f.recipientRepository.rows.map((row) => row.email)).toEqual(['ana@partner.com']);
    });

    it('verifies once: the link stops working after use', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      const token = f.notifier.tokenFor('ana@partner.com');

      expect(await f.recipients.inspectVerification(token)).toMatchObject({ status: 'pending' });
      const verified = await f.recipients.verify(token);

      expect(verified.status).toBe('verified');
      expect(f.recipientRepository.rows[0]).toMatchObject({
        status: 'verified',
        verifiedAt: f.clock.now.toISOString(),
        verificationTokenHash: null,
      });
      expect(await linkError(f.recipients.verify(token))).toBe('invalid');
    });

    it('rejects expired and unknown links', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      const token = f.notifier.tokenFor('ana@partner.com');

      expect(await linkError(f.recipients.verify('made-up'))).toBe('invalid');
      expect(await linkError(f.recipients.verify(''))).toBe('invalid');
      f.advance(VERIFICATION_TTL_MS);
      expect(await linkError(f.recipients.verify(token))).toBe('expired');
      expect(f.recipientRepository.rows[0].status).toBe('pending');
    });

    it('sends a new link when an expired pending address is added again', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      const first = f.notifier.tokenFor('ana@partner.com');
      f.advance(VERIFICATION_TTL_MS + 1);
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');

      expect(f.notifier.sent).toHaveLength(2);
      const second = f.notifier.tokenFor('ana@partner.com');
      expect(await linkError(f.recipients.verify(first))).toBe('invalid');
      expect((await f.recipients.verify(second)).status).toBe('verified');
    });

    it('rate limits confirmation emails per address and per organization', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      const [{ id }] = f.recipientRepository.rows;

      await f.recipients.resendVerification(ORG, id);
      await f.recipients.resendVerification(ORG, id);
      const limited = await f.recipients.resendVerification(ORG, id).catch((error) => error);
      expect(limited).toBeInstanceOf(VerificationRateLimitedError);
      expect(f.notifier.sent).toHaveLength(3);

      f.advance(60 * 60 * 1000);
      await expect(f.recipients.resendVerification(ORG, id)).resolves.toMatchObject({
        status: 'pending',
      });

      // 30 per organization and hour
      const many = Array.from({ length: 40 }, (_, index) => `user${index}@partner.com`);
      await f.recipients.register(ORG, many, 'admin');
      expect(f.notifier.sent).toHaveLength(4 + 29);
      expect(f.recipientRepository.rows.filter((row) => row.status === 'pending')).toHaveLength(41);
    });

    it('keeps the address pending when the email fails, and never throws on register', async () => {
      f.notifier.fail = true;
      await expect(
        f.recipients.register(ORG, ['ana@partner.com'], 'admin'),
      ).resolves.toBeUndefined();
      expect(f.recipientRepository.rows[0].status).toBe('pending');
    });

    it('does not resend to verified recipients or to other organizations', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      await f.recipients.verify(f.notifier.tokenFor('ana@partner.com'));
      const [{ id }] = f.recipientRepository.rows;

      await expect(f.recipients.resendVerification(ORG, id)).rejects.toBeInstanceOf(
        ExternalRecipientStateError,
      );
      await expect(f.recipients.resendVerification(OTHER_ORG, id)).rejects.toThrow(/not found/);
    });

    it('removes a pending address: its confirmation link stops working', async () => {
      await f.recipients.register(ORG, ['typo@partner.com'], 'admin');
      const token = f.notifier.tokenFor('typo@partner.com');
      const [{ id }] = f.recipientRepository.rows;

      await expect(f.recipients.remove(OTHER_ORG, id)).rejects.toThrow(/not found/);
      await expect(f.recipients.remove(ORG, id)).resolves.toMatchObject({
        email: 'typo@partner.com',
        status: 'pending',
      });
      expect(f.recipientRepository.rows).toEqual([]);
      await expect(f.recipients.verify(token)).rejects.toBeInstanceOf(InvalidNotificationLinkError);
    });

    it('only removes pending addresses', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      await f.recipients.verify(f.notifier.tokenFor('ana@partner.com'));
      const [{ id }] = f.recipientRepository.rows;
      await expect(f.recipients.remove(ORG, id)).rejects.toBeInstanceOf(
        ExternalRecipientStateError,
      );
      expect(f.recipientRepository.rows).toHaveLength(1);
    });

    it('builds no link without ORIGIN, so nothing is sent', async () => {
      f = createNotificationsFixture({ origin: null });
      await f.settings.setAllowedDomains(ORG, ['partner.com']);
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');

      expect(f.notifier.sent).toHaveLength(0);
      expect(f.recipientRepository.rows[0]).toMatchObject({
        status: 'pending',
        verificationTokenHash: null,
      });
    });
  });

  describe('delivery and unsubscribe', () => {
    async function verified(email: string) {
      await f.recipients.register(ORG, [email], 'admin');
      await f.recipients.verify(f.notifier.tokenFor(email));
    }

    it('only delivers to verified addresses of allowed domains, with an unsubscribe link', async () => {
      await verified('ana@partner.com');
      await f.recipients.register(ORG, ['pending@partner.com'], 'admin');

      const deliverable = await f.recipients.deliverable(ORG, [
        'ana@partner.com',
        'pending@partner.com',
        'never-added@partner.com',
      ]);

      expect(deliverable.map((recipient) => recipient.email)).toEqual(['ana@partner.com']);
      expect(deliverable[0].unsubscribeUrl).toMatch(
        /^https:\/\/gitops\.example\.com\/notifications\/unsubscribe\?token=v1\./,
      );
      // another organization's alerts don't see it
      expect(await f.recipients.deliverable(OTHER_ORG, ['ana@partner.com'])).toEqual([]);
    });

    it('unsubscribes once: the link is single use and the address stops receiving', async () => {
      await verified('ana@partner.com');
      const [{ unsubscribeUrl }] = await f.recipients.deliverable(ORG, ['ana@partner.com']);
      const token = tokenOf(unsubscribeUrl);

      expect((await f.recipients.inspectUnsubscribe(token)).email).toBe('ana@partner.com');
      expect((await f.recipients.unsubscribe(token)).status).toBe('unsubscribed');
      expect(await f.recipients.deliverable(ORG, ['ana@partner.com'])).toEqual([]);
      expect(await linkError(f.recipients.unsubscribe(token))).toBe('invalid');
      expect(f.recipientRepository.rows[0]).toMatchObject({
        status: 'unsubscribed',
        unsubscribedAt: f.clock.now.toISOString(),
        unsubscribeVersion: 1,
      });
    });

    it('lets an unsubscribed address resubscribe only through a new confirmation', async () => {
      await verified('ana@partner.com');
      const [{ unsubscribeUrl }] = await f.recipients.deliverable(ORG, ['ana@partner.com']);
      await f.recipients.unsubscribe(tokenOf(unsubscribeUrl));
      const [{ id }] = f.recipientRepository.rows;

      // adding it to another alert does not resubscribe it
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      expect(f.recipientRepository.rows[0].status).toBe('unsubscribed');

      await f.recipients.resendVerification(ORG, id);
      await f.recipients.verify(f.notifier.tokenFor('ana@partner.com'));
      const [again] = await f.recipients.deliverable(ORG, ['ana@partner.com']);
      expect(again.unsubscribeUrl).not.toBe(unsubscribeUrl);
      expect(await linkError(f.recipients.unsubscribe(tokenOf(unsubscribeUrl)))).toBe('invalid');
    });

    it('rejects expired and forged unsubscribe links', async () => {
      await verified('ana@partner.com');
      const [{ unsubscribeUrl }] = await f.recipients.deliverable(ORG, ['ana@partner.com']);
      const token = tokenOf(unsubscribeUrl);

      expect(await linkError(f.recipients.unsubscribe(`${token.slice(0, -2)}xx`))).toBe('invalid');
      expect(await linkError(f.recipients.unsubscribe('v1.e30.abc'))).toBe('invalid');
      f.advance(UNSUBSCRIBE_TTL_MS);
      expect(await linkError(f.recipients.unsubscribe(token))).toBe('expired');
      expect(f.recipientRepository.rows[0].status).toBe('verified');
    });

    it('sends nothing to external addresses without ORIGIN (no unsubscribe link)', async () => {
      await verified('ana@partner.com');
      const noOrigin = createNotificationsFixture({ origin: null });
      noOrigin.recipientRepository.rows = structuredClone(f.recipientRepository.rows);
      await noOrigin.settings.setAllowedDomains(ORG, ['partner.com']);

      expect(await noOrigin.recipients.deliverable(ORG, ['ana@partner.com'])).toEqual([]);
    });
  });

  describe('allowed domains', () => {
    it('blocks the recipients of a removed domain without deleting them, and restores them', async () => {
      await f.recipients.register(ORG, ['ana@partner.com', 'eva@eu.client.io'], 'admin');
      await f.recipients.verify(f.notifier.tokenFor('ana@partner.com'));

      const removed = await f.settings.setAllowedDomains(ORG, ['*.client.io']);
      expect(removed).toMatchObject({ blocked: 1, restored: 0 });
      expect(f.recipientRepository.rows.map((row) => [row.email, row.status])).toEqual([
        ['ana@partner.com', 'blocked'],
        ['eva@eu.client.io', 'pending'],
      ]);
      expect(await f.recipients.deliverable(ORG, ['ana@partner.com'])).toEqual([]);

      const restored = await f.settings.setAllowedDomains(ORG, 'partner.com\n*.client.io');
      expect(restored).toMatchObject({ blocked: 0, restored: 1 });
      expect(f.recipientRepository.rows[0]).toMatchObject({ status: 'verified', blockedAt: null });
      expect(await f.recipients.deliverable(ORG, ['ana@partner.com'])).toHaveLength(1);
    });

    it('records the consent of a blocked address that confirms, but keeps it blocked', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      await f.settings.setAllowedDomains(ORG, []);
      await f.recipients.verify(f.notifier.tokenFor('ana@partner.com'));

      expect(f.recipientRepository.rows[0]).toMatchObject({ status: 'blocked' });
      await f.settings.setAllowedDomains(ORG, ['partner.com']);
      expect(f.recipientRepository.rows[0].status).toBe('verified');
    });

    it('normalizes, de-duplicates and validates the domain list', async () => {
      const result = await f.settings.setAllowedDomains(ORG, [
        ' Partner.COM ',
        'partner.com',
        'ÑANDÚ.es',
      ]);
      expect(result.settings.allowedExternalEmailDomains).toEqual([
        'partner.com',
        'xn--and-6ma2c.es',
      ]);

      const error = await f.settings
        .setAllowedDomains(ORG, ['partner.com', 'http://evil', '*'])
        .catch((caught) => caught);
      expect(error).toBeInstanceOf(NotificationSettingsValidationError);
      expect(error.errors).toEqual({
        'allowedExternalEmailDomains.1': 'invalid_domain',
        'allowedExternalEmailDomains.2': 'invalid_domain',
      });
      // nothing changed
      expect((await f.settings.get(ORG)).allowedExternalEmailDomains).toEqual([
        'partner.com',
        'xn--and-6ma2c.es',
      ]);
    });

    it('stamps blockedAt with the time the domain was removed', async () => {
      await f.recipients.register(ORG, ['ana@partner.com'], 'admin');
      f.advance(DAY);
      await f.settings.setAllowedDomains(ORG, []);
      expect(f.recipientRepository.rows[0].blockedAt).toBe(f.clock.now.toISOString());
    });
  });
});
