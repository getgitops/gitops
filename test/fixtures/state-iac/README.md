# State IaC fixtures

Pulumi DIY (self-managed) backend contents used by the State IaC tests. Each folder is the root
of a bucket (or of a bucket prefix): point an in-memory/local `ObjectStore` at it.

Decisions and format notes: [`docs/adr/0003-state-iac.md`](../../../docs/adr/0003-state-iac.md).

## Origin

Taken from a real GCS bucket (2 Pulumi projects, 3 stacks, 61 updates between May and November 2026,
Pulumi v3.228–v3.276) and **anonymized**:

- Organization, project and domain names → `acme`, `acme-infra`, `acme-platform`, `acme.example`.
- GCP project numbers, public IPs (→ `203.0.113.0/24`), emails, git author/committer, `git.head`,
  local paths and PEM certificates replaced. Private (RFC 1918) IPs kept.
- Every `ciphertext`, `secure` and `salt` value replaced by a fake `v1:<nonce>:<ct>` string. Each
  occurrence is different, just like real Pulumi re-encrypts secrets with a fresh nonce on every write,
  so the diff tests see the same noise as production.
- Resources cut down to a representative subset (49 of 149 in prod, 45 of 114 in staging): stack, provider, components,
  service APIs, IAM, Cloud SQL (with secret passwords), load balancer, Secret Manager, buckets
  (resource references) and DNS. The DNS component's `records` input is synthetic.

JSON formatting is kept as Pulumi wrote it (compact checkpoints, 4-space indented history and
empty stack), which is why `test/fixtures/` is in `.prettierignore`. Do not reformat these files.

## Contents

### `project-layout/.pulumi` (meta.yaml `version: 1`)

| Path | What it covers |
| --- | --- |
| `stacks/acme-infra/prod.json` | Current state, compact JSON, 49 resources, stack outputs |
| `stacks/acme-infra/prod.json.bak` | Previous state (must be ignored when listing stacks) |
| `stacks/acme-infra/prod.json.<ns>` | **Synthetic** `PULUMI_RETAIN_CHECKPOINTS` copy (must be ignored when listing) |
| `stacks/acme-infra/staging.json.gz` | **Synthetic gzip** (`PULUMI_DIY_BACKEND_GZIP`) of a real state |
| `stacks/acme-platform/dev.json` (+ `.bak`) | Empty stack: no `resources` key; `.bak` is `version: 0` from `stack init` |
| `history/acme-infra/prod/prod-<ns>.{history,checkpoint}.json` | 4 real updates, in order: **failed** (CI, Linux, UTC times), provider bump with 38 creates and 1 replace, a replace (managed certificate), and a 2-resource update. Each checkpoint is the state *after* that update |
| `history/acme-infra/staging/*.json.gz` | **Synthetic gzip** of one real `refresh` and one real `resource-import` |
| `backups/acme-infra/prod/prod.<ns>.json` | Backup written right after the last update (same content as its checkpoint) |
| `locks/organization/acme-infra/prod/<uuid>.json` | **Synthetic** lock (`pid`, `username`, `hostname`, `timestamp`) |

### `legacy-layout/.pulumi` (no meta.yaml)

**Synthetic**, derived from the prod data: `stacks/prod.json` and `history/prod/…`, with
`checkpoint.stack: "prod"` and the project `acme-legacy` only in the URNs
(`urn:pulumi:prod::acme-legacy::…`), which is the only place a reader can find it.

## Expected values (for assertions)

- Stacks: `acme-infra/prod`, `acme-infra/staging`, `acme-platform/dev` (project layout);
  `prod` → project `acme-legacy` (legacy).
- Normalized diff between consecutive prod checkpoints (rules in the ADR): `…2066…` → `…2803…`
  changes 4 resources (`lb-prod-cert` is a **replace**: same URN, new `id`); `…2803…` → `…4216…`
  changes 2 resources (`cloud-sql-acme-prod`, `acme-prod`). A raw JSON comparison flags ~30 in both.
