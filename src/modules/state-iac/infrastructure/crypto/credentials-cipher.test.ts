import { describe, expect, it } from 'vitest';
import { createCredentialsCipher } from './credentials-cipher';

describe('credentials cipher', () => {
  const cipher = createCredentialsCipher(() => 'key-1');

  it('round-trips and never stores the plain value', () => {
    const stored = cipher.encrypt('backend-1', '{"secretAccessKey":"s3cr3t"}');
    expect(stored).not.toContain('s3cr3t');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt('backend-1', stored)).toBe('{"secretAccessKey":"s3cr3t"}');
  });

  it('uses a fresh IV every time', () => {
    expect(cipher.encrypt('backend-1', 'x')).not.toBe(cipher.encrypt('backend-1', 'x'));
  });

  it('binds the value to its backend: copied onto another one it does not decrypt', () => {
    const stored = cipher.encrypt('backend-1', 'secret');
    expect(() => cipher.decrypt('backend-2', stored)).toThrow(/could not be decrypted/);
  });

  it('fails with another key or a tampered value', () => {
    const stored = cipher.encrypt('backend-1', 'secret');
    expect(() => createCredentialsCipher(() => 'key-2').decrypt('backend-1', stored)).toThrow();
    const [version, iv, tag, ciphertext] = stored.split(':');
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;
    const tampered = [version, iv, tag, flipped.toString('base64')].join(':');
    expect(() => cipher.decrypt('backend-1', tampered)).toThrow(/could not be decrypted/);
    expect(() => cipher.decrypt('backend-1', 'plain')).toThrow(/no encrypted credentials/);
  });

  it('requires GITDB_ENCRYPTION_KEY', () => {
    expect(() => createCredentialsCipher(() => ' ').encrypt('b', 'x')).toThrow(
      /GITDB_ENCRYPTION_KEY/,
    );
  });
});
