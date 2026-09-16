import { afterEach, describe, expect, it } from 'vitest';
import { decryptTargetCredential, encryptTargetCredential } from './target-credential-cipher';

describe('target credential cipher', () => {
  afterEach(() => delete process.env.GITDB_ENCRYPTION_KEY);

  it('encrypts and decrypts a target token', () => {
    process.env.GITDB_ENCRYPTION_KEY = 'test-encryption-key';
    const encrypted = encryptTargetCredential('target-1', 'slack', 'xoxb-secret');

    expect(encrypted).not.toContain('xoxb-secret');
    expect(decryptTargetCredential('target-1', 'slack', encrypted)).toBe('xoxb-secret');
  });

  it('encrypts a complete Google Chat webhook URL', () => {
    process.env.GITDB_ENCRYPTION_KEY = 'test-encryption-key';
    const webhook =
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=key-value&token=token-value';
    const encrypted = encryptTargetCredential('target-2', 'google-chat', webhook);

    expect(encrypted).not.toContain('chat.googleapis.com');
    expect(decryptTargetCredential('target-2', 'google-chat', encrypted)).toBe(webhook);
  });
});
