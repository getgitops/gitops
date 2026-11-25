import { createHmac, timingSafeEqual } from 'node:crypto';

/** How far `t` may be from the receiver's clock: older deliveries are replays. */
export const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies the `X-GitOps-Signature` header of a GitOps webhook delivery.
 *
 * @param rawBody the request body exactly as received (before any JSON parsing)
 * @param header  the `X-GitOps-Signature` header (`t=<unix>,v1=<hex>[,v1=<hex>]`)
 * @param secret  the channel's signing secret (`whsec_…`)
 */
export function verifyGitOpsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't') timestamp = Number(value);
    else if (key === 'v1' && value) signatures.push(value);
  }
  if (!Number.isInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  // during a secret rotation there are two `v1=`: any of them may match
  return signatures.some((signature) => {
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
