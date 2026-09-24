import { describe, expect, it } from 'vitest';
import { MailNotification } from './mail-notification';

describe('MailNotification', () => {
  it('normalizes a single recipient into a list', () => {
    const notification = new MailNotification({
      to: '  user@example.com ',
      subject: ' Welcome ',
      content: '<p>Hi</p>',
    });

    expect(notification.channel).toBe('mail');
    expect(notification.to).toEqual(['user@example.com']);
    expect(notification.subject).toBe('Welcome');
  });

  it('keeps multiple recipients and drops empty entries', () => {
    const notification = new MailNotification({
      to: ['a@example.com', '   ', 'b@example.com'],
      subject: 'Welcome',
      content: '<p>Hi</p>',
    });

    expect(notification.to).toEqual(['a@example.com', 'b@example.com']);
  });

  describe('validate', () => {
    it('requires at least one recipient', () => {
      expect(() =>
        new MailNotification({ to: [], subject: 'Welcome', content: '<p>Hi</p>' }).validate(),
      ).toThrow(/at least one recipient/);
    });

    it('rejects malformed recipients', () => {
      expect(() =>
        new MailNotification({
          to: 'not-an-email',
          subject: 'Welcome',
          content: '<p>Hi</p>',
        }).validate(),
      ).toThrow(/not a valid email/);
    });

    it('requires a subject', () => {
      expect(() =>
        new MailNotification({
          to: 'user@example.com',
          subject: '   ',
          content: '<p>Hi</p>',
        }).validate(),
      ).toThrow(/requires a subject/);
    });

    it('requires content', () => {
      expect(() =>
        new MailNotification({
          to: 'user@example.com',
          subject: 'Welcome',
          content: '   ',
        }).validate(),
      ).toThrow(/requires a content/);
    });

    it('passes for a complete notification', () => {
      expect(() =>
        new MailNotification({
          to: 'user@example.com',
          subject: 'Welcome',
          content: '<p>Hi</p>',
        }).validate(),
      ).not.toThrow();
    });
  });
});
