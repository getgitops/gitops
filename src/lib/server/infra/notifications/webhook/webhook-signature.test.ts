import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOLERANCE_SECONDS,
  verifyGitOpsSignature,
} from '../../../../../../docs/webhooks/verify-signature';
import {
  computeSignature,
  generateSigningSecret,
  signatureHeader,
  SIGNING_SECRET_PREFIX,
} from './webhook-signature';

const BODY = '{"hello":"world"}';
const T = 1_700_000_000;
// HMAC-SHA256 computed outside this code (Python's hmac module) for these inputs
const KNOWN = 'f592bbf3951cfc94e560eecfb5d9dd4da6b0fff2e626235f8ab4b54860925d0b';
const KNOWN_OLD = 'd30afec711349560803be4b024ef1aa59709bddff9b640379e8656024fe3b10c';

describe('webhook signature', () => {
  it('matches a known HMAC-SHA256 vector of "<t>.<raw body>"', () => {
    expect(computeSignature('whsec_test', T, BODY)).toBe(KNOWN);
    expect(signatureHeader(['whsec_test'], T, BODY)).toBe(`t=${T},v1=${KNOWN}`);
  });

  it('repeats v1= for every active secret, newest first (rotation grace period)', () => {
    expect(signatureHeader(['whsec_test', 'whsec_old'], T, BODY)).toBe(
      `t=${T},v1=${KNOWN},v1=${KNOWN_OLD}`,
    );
  });

  it('refuses to sign without a secret', () => {
    expect(() => signatureHeader([], T, BODY)).toThrow();
  });

  it('generates 32 random bytes per secret', () => {
    const secret = generateSigningSecret();
    expect(secret).toMatch(new RegExp(`^${SIGNING_SECRET_PREFIX}[0-9a-f]{64}$`));
    expect(generateSigningSecret()).not.toBe(secret);
  });
});

describe('documented verification example (docs/webhooks/verify-signature.ts)', () => {
  const header = signatureHeader(['whsec_test'], T, BODY);

  it('accepts what GitOps signs', () => {
    expect(verifyGitOpsSignature(BODY, header, 'whsec_test', T)).toBe(true);
    expect(verifyGitOpsSignature(BODY, header, 'whsec_test', T + TOLERANCE_SECONDS)).toBe(true);
  });

  it('accepts either secret while a rotation signs with both', () => {
    const both = signatureHeader(['whsec_test', 'whsec_old'], T, BODY);
    expect(verifyGitOpsSignature(BODY, both, 'whsec_old', T)).toBe(true);
    expect(verifyGitOpsSignature(BODY, both, 'whsec_test', T)).toBe(true);
  });

  it.each([
    ['another secret', BODY, header, 'whsec_other', T],
    ['a modified body', '{"hello":"World"}', header, 'whsec_test', T],
    ['an old timestamp (replay)', BODY, header, 'whsec_test', T + TOLERANCE_SECONDS + 1],
    ['a timestamp from the future', BODY, header, 'whsec_test', T - TOLERANCE_SECONDS - 1],
    ['a missing header', BODY, null, 'whsec_test', T],
    ['a header without v1', BODY, `t=${T}`, 'whsec_test', T],
    ['a truncated signature', BODY, `t=${T},v1=${KNOWN.slice(0, 10)}`, 'whsec_test', T],
    ['a changed timestamp', BODY, header.replace(`t=${T}`, `t=${T + 1}`), 'whsec_test', T],
  ])('rejects %s', (_case, body, value, secret, now) => {
    expect(verifyGitOpsSignature(body, value, secret, now)).toBe(false);
  });

  it('is the code the documentation shows', () => {
    const docs = path.resolve(import.meta.dirname, '../../../../../../docs/webhooks');
    const code = readFileSync(path.join(docs, 'verify-signature.ts'), 'utf8');
    const readme = readFileSync(path.join(docs, 'README.md'), 'utf8');
    expect(readme).toContain(code);
  });
});
