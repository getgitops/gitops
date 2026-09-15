import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptSecretValue,
  decryptSecretValues,
  encryptSecretValue,
  encryptSecretValues,
  isEncryptedSecretValue,
} from './secret-cipher';

describe('vault secret cipher', () => {
  beforeEach(() => {
    process.env.VAULT_ENCRYPTION_KEY = 'test-vault-key';
    delete process.env.GITDB_ENCRYPTION_KEY;
  });

  it('round-trips a value with AES-256-GCM', () => {
    const sealed = encryptSecretValue('secret-1', 'prod', 'super-secret');

    expect(sealed).not.toContain('super-secret');
    expect(sealed.split(':')).toHaveLength(4);
    expect(isEncryptedSecretValue(sealed)).toBe(true);
    expect(decryptSecretValue('secret-1', 'prod', sealed)).toBe('super-secret');
  });

  it('produces a different ciphertext on every write', () => {
    const first = encryptSecretValue('secret-1', 'prod', 'same');
    const second = encryptSecretValue('secret-1', 'prod', 'same');

    expect(first).not.toBe(second);
    expect(decryptSecretValue('secret-1', 'prod', second)).toBe('same');
  });

  it('rejects a ciphertext replayed on another secret or environment', () => {
    const sealed = encryptSecretValue('secret-1', 'prod', 'super-secret');

    expect(() => decryptSecretValue('secret-2', 'prod', sealed)).toThrow(/descifrar/);
    expect(() => decryptSecretValue('secret-1', 'dev', sealed)).toThrow(/descifrar/);
  });

  it('rejects a tampered ciphertext', () => {
    const [version, iv, tag] = encryptSecretValue('secret-1', 'prod', 'value').split(':');
    const tampered = [version, iv, tag, Buffer.from('hacked').toString('base64')].join(':');

    expect(() => decryptSecretValue('secret-1', 'prod', tampered)).toThrow(/descifrar/);
  });

  it('rejects a ciphertext sealed with another key', () => {
    const sealed = encryptSecretValue('secret-1', 'prod', 'value');
    process.env.VAULT_ENCRYPTION_KEY = 'another-key';

    expect(() => decryptSecretValue('secret-1', 'prod', sealed)).toThrow(/descifrar/);
  });

  it('falls back to GITDB_ENCRYPTION_KEY', () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    process.env.GITDB_ENCRYPTION_KEY = 'cluster-key';

    const sealed = encryptSecretValue('secret-1', 'prod', 'value');
    expect(decryptSecretValue('secret-1', 'prod', sealed)).toBe('value');
  });

  it('throws when no key is configured', () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    delete process.env.GITDB_ENCRYPTION_KEY;

    expect(() => encryptSecretValue('secret-1', 'prod', 'value')).toThrow(/VAULT_ENCRYPTION_KEY/);
  });

  it('reads legacy plaintext values untouched', () => {
    expect(isEncryptedSecretValue('plain-value')).toBe(false);
    expect(decryptSecretValue('secret-1', 'prod', 'plain-value')).toBe('plain-value');
  });

  it('seals and opens every environment of a secret', () => {
    const values = { dev: 'a', stage: '', prod: 'c' };
    const sealed = encryptSecretValues('secret-1', values);

    expect(Object.keys(sealed)).toEqual(['dev', 'stage', 'prod']);
    expect(Object.values(sealed).every(isEncryptedSecretValue)).toBe(true);
    expect(decryptSecretValues('secret-1', sealed)).toEqual(values);
  });

  it('handles empty value maps', () => {
    expect(encryptSecretValues('secret-1', undefined)).toEqual({});
    expect(decryptSecretValues('secret-1', undefined)).toEqual({});
  });
});
