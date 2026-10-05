import { describe, expect, it } from 'vitest';
import { SecretCipherService } from './secret-cipher.service';

describe('SecretCipherService', () => {
  const cipher = new SecretCipherService(() => 'test-master-key');

  it('round-trips a secret without storing it in clear', () => {
    const encrypted = cipher.encrypt('GOCSPX-super-secret', 'sso');

    expect(encrypted).not.toContain('GOCSPX-super-secret');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(encrypted, 'sso')).toBe('GOCSPX-super-secret');
  });

  it('uses a fresh IV per encryption', () => {
    expect(cipher.encrypt('same', 'sso')).not.toBe(cipher.encrypt('same', 'sso'));
  });

  it('rejects a ciphertext decrypted for another purpose', () => {
    const encrypted = cipher.encrypt('secret', 'sso');
    expect(() => cipher.decrypt(encrypted, 'other')).toThrow();
  });

  it('rejects a ciphertext produced with another master key', () => {
    const encrypted = new SecretCipherService(() => 'another-key').encrypt('secret', 'sso');
    expect(() => cipher.decrypt(encrypted, 'sso')).toThrow();
  });

  it('rejects a tampered ciphertext', () => {
    const [version, iv, tag, data] = cipher.encrypt('secret', 'sso').split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 0xff;
    expect(() =>
      cipher.decrypt([version, iv, tag, flipped.toString('base64url')].join(':'), 'sso'),
    ).toThrow();
  });
});
