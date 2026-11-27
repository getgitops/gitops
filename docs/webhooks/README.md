# Generic webhooks

A **webhook** notification channel posts every alert it is attached to as a signed JSON request
to a URL you choose. It is created from the alert settings ("Settings" in an alert list → Channels)
of an organization (usable by every project of it) or of a project.

## The request

```http
POST <your URL>
Content-Type: application/json
User-Agent: GitOps-Webhooks/1
X-GitOps-Event: code_report.analysis.completed
X-GitOps-Delivery: 3f0c6c3e-2a0e-4f43-9f87-6a0f1d1c2b55
X-GitOps-Signature: t=1764000000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

```json
{
  "version": 1,
  "deliveryId": "3f0c6c3e-2a0e-4f43-9f87-6a0f1d1c2b55",
  "test": false,
  "alert": { "id": "…", "name": "Critical vulnerabilities" },
  "event": {
    "id": "…",
    "type": "code_report.analysis.completed",
    "occurredAt": "2026-11-25T10:00:00.000Z",
    "scope": { "organizationId": "…", "projectId": "…" },
    "fields": { "serviceId": "…", "tool": "trivy", "summary.critical": 3 }
  },
  "link": "https://gitops.example.com/org/acme/projects/web/…"
}
```

- `version` only changes when a field is removed or renamed; new fields may appear in version 1,
  so ignore the ones you don't know.
- `event.fields` holds the event catalog values (ids, enums, numbers), the same fields alerts can
  filter on. Fields marked sensitive are never sent; there are no templates nor HTML.
- `link` is `null` when the server has no `ORIGIN`.
- "Send test message" posts `event.type: "channel.test"` with `test: true`, no alert and empty
  `fields`. Alert test sends carry the real event shape with `test: true`.
- `X-GitOps-Delivery` is the same on every retry of one delivery: use it to deduplicate.

Any `2xx` answer is a success. The answer body is read up to 64 KB and discarded. Redirects are
never followed (a `3xx` is a failure). Each attempt times out after 5 s.

## Retries and automatic disabling

Network errors, timeouts, `429` (honoring `Retry-After`, up to 60 s) and `5xx` are retried up to 4
attempts (1 s → 4 s → 16 s, with jitter). Other `4xx` answers are final. After **20 failed
deliveries in a row** the channel disables itself, its creator gets an email and the
`notifications.channel.disabled` event is published (organizations can alert on it). Enabling the
channel again resets the count. Test messages never count.

## Verifying the signature

`X-GitOps-Signature` is `t=<unix seconds>,v1=<hex>`, where the signature is
`HMAC-SHA256(secret, "<t>.<raw body>")` and the secret is the whole `whsec_…` string shown when
the channel was created. To verify a delivery:

1. Take the body **exactly as received**, before parsing it (re-serialized JSON won't match).
2. Recompute the HMAC with your secret and compare it with each `v1=` value in constant time.
3. Reject deliveries whose `t` is more than 5 minutes away from your clock (replays).

```ts
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
```

`docs/webhooks/verify-signature.ts` holds this same code and is covered by the unit tests.

## Rotating the secret

"Rotate signing secret" shows a new secret once. For the next **24 hours** every delivery is
signed with both secrets (`t=…,v1=<new>,v1=<previous>`), so you can deploy the new secret to the
receiver without losing deliveries; after that only the new one signs. Rotating again during the
grace period drops the oldest secret.

## Network rules (anti-SSRF)

The URL must be `https`, without user or password. Its host is resolved when the channel is saved
and before every delivery, and it is refused when **any** address is private, loopback,
link-local, CGNAT, multicast, reserved or the cloud metadata one (`169.254.169.254`), IPv4 and IPv6
(IPv4-mapped forms included). The request then connects only to the address that was checked, so
DNS rebinding can't redirect it. For local development only, `NOTIFICATIONS_WEBHOOK_ALLOW_HTTP`
and `NOTIFICATIONS_WEBHOOK_ALLOW_PRIVATE_TARGETS` lift these rules.

The URL and the secret are stored encrypted (`GITDB_ENCRYPTION_KEY`), never returned by the API
(the secret only in the create / rotate response) and never logged.
