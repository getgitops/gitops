import { describe, expect, it } from 'vitest';
import { createChannelCipher } from './channel-cipher';

const url = 'https://hooks.slack.com/services/T000/B000/abcdef1a2b';

describe('channel cipher', () => {
  it('round-trips a destination without keeping it readable', () => {
    const cipher = createChannelCipher(() => 'key-1');
    const stored = cipher.encrypt('channel-1', url);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('hooks.slack.com');
    expect(cipher.decrypt('channel-1', stored)).toBe(url);
    // a fresh IV each time
    expect(cipher.encrypt('channel-1', url)).not.toBe(stored);
  });

  it('does not decrypt on another channel nor with another key', () => {
    const stored = createChannelCipher(() => 'key-1').encrypt('channel-1', url);
    expect(() => createChannelCipher(() => 'key-1').decrypt('channel-2', stored)).toThrow(
      /could not be decrypted/,
    );
    expect(() => createChannelCipher(() => 'key-2').decrypt('channel-1', stored)).toThrow(
      /could not be decrypted/,
    );
    expect(() => createChannelCipher(() => 'key-1').decrypt('channel-1', url)).toThrow(
      /no encrypted destination/,
    );
  });

  it('refuses to work without a key', () => {
    expect(() => createChannelCipher(() => ' ').encrypt('channel-1', url)).toThrow(
      /GITDB_ENCRYPTION_KEY/,
    );
  });
});
