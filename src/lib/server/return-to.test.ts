import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-to';

describe('safeReturnPath', () => {
  it.each([
    ['/notifications/slack/link?token=abc', '/notifications/slack/link?token=abc'],
    ['/notifications/slack/link', '/notifications/slack/link'],
    ['/org/acme', null],
    ['//evil.example.com/notifications/slack/link', null],
    ['/\\evil.example.com', null],
    ['https://evil.example.com/notifications/slack/link', null],
    ['/notifications/slack/link/../../auth/logout', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});
