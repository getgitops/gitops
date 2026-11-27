# ADR 0003: State IaC, read-only Pulumi DIY state from GCS/S3 buckets

- Status: Accepted
- Date: 2026-11-25
- Epic: #105 · Spike: #110

## Context

The State IaC module shows the infrastructure-as-code state that teams already keep in their own
buckets: stacks, resources, outputs, update history and what changed between two versions. v1
reads the Pulumi DIY (self-managed) backend on GCS, S3 and S3-compatible stores; Terraform/OpenTofu
comes later and must be just another engine.

Constraints: GitOps **never writes, locks or modifies** a state. GitDB only stores configuration
(backends and bindings); state is read from the bucket on demand and cached in memory at most.
Secret values and backend credentials never leave the server.

This ADR is based on a real bucket (2 Pulumi projects, 3 stacks, 190 objects, 61 updates from May
to November 2026, Pulumi v3.228 → v3.276) and on the DIY backend source (`pkg/backend/diy` in
`pulumi/pulumi`: `state.go`, `store.go`, `meta.go`, `lock.go`). Anonymized copies are in
`test/fixtures/state-iac/` (see its README).

## Findings: the DIY layout

Everything lives under `<prefix>/.pulumi/`.

| What                                                   | `project` layout (`meta.yaml` `version: 1`)                    | `legacy` layout (no `meta.yaml`) |
| ------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------- |
| Current state                                          | `stacks/<project>/<stack>.json`                                | `stacks/<stack>.json`            |
| Previous state                                         | `stacks/<project>/<stack>.json.bak`                            | `stacks/<stack>.json.bak`        |
| Retained copies (`PULUMI_RETAIN_CHECKPOINTS`)          | `stacks/<project>/<stack>.json.<unixnano>`                     | `stacks/<stack>.json.<unixnano>` |
| History entry                                          | `history/<project>/<stack>/<stack>-<unixnano>.history.json`    | `history/<stack>/…`              |
| State after that entry                                 | `history/<project>/<stack>/<stack>-<unixnano>.checkpoint.json` | `history/<stack>/…`              |
| Backups (off with `PULUMI_DISABLE_CHECKPOINT_BACKUPS`) | `backups/<project>/<stack>/<stack>.<unixnano>.json`            | `backups/<stack>/…`              |
| Locks                                                  | `locks/organization/<project>/<stack>/<uuid>.json`             | `locks/<stack>/<uuid>.json`      |

Corrections to what the epic expected:

- **`*.checkpoint.json` in `history/` is always written**, paired 1:1 with each `*.history.json`
  through the same `<unixnano>` (`addToHistory` copies the stack file there). Confirmed in the
  bucket: 61/61 pairs. `PULUMI_RETAIN_CHECKPOINTS` is something else: extra copies in `stacks/`.
- **Locks are keyed by the fully qualified name**, so the project layout path includes the
  literal `organization/` segment.
- **Failed updates are recorded too** (21 of 61 here), with the checkpoint of the partial state.
- **Gzip** (`PULUMI_DIY_BACKEND_GZIP`) adds `.gz` to every file: stack, history, checkpoint and
  backup (`.json.gz`). Pulumi detects compression from the content, not the name. When both
  `x.json` and `x.json.gz` exist, the most recently modified one wins; the other is deleted after a
  successful write with a different compression. ZSTD (`.json.zst`) exists in recent versions
  too: v1 reads gzip and reports zstd as unsupported.
- **Legacy layout**: Pulumi treats a bucket without `meta.yaml` that contains legacy stacks as
  `version: 0`; an empty bucket gets `version: 1`. **The current CLI refuses version 0** ("Legacy DIY state is no
  longer supported, please use Pulumi v3.274.1 or earlier"), so legacy buckets are old and frozen
  or about to be migrated (`pulumi state upgrade`). We still read them. `checkpoint.stack` is just
  `<stack>` there (project layout: `organization/<project>/<stack>`), so the project is only in
  the URNs: `urn:pulumi:<stack>::<project>::<type>::<name>`. An empty legacy stack has no URNs: its
  project is unknown. Also try the `<project>:` prefix of the config keys in its history.
- An unknown `meta.yaml` version is an error ("layout not supported"), never a guess.

### Checkpoint format (`version: 3`)

```jsonc
{
  "version": 3,
  "checkpoint": {
    "stack": "organization/acme-infra/prod",
    "latest": {
      "manifest": { "time": "2026-11-25T11:56:55+01:00", "magic": "…", "version": "v3.276.0" },
      "secrets_providers": { "type": "passphrase", "state": { "salt": "v1:…" } },
      "metadata": {},
      "resources": [/* in dependency order */],
      "pending_operations": [/* only after an interrupted operation */],
    },
  },
}
```

- A freshly initialized stack has no `resources` key; its `.bak` is `{"version": 0, "checkpoint": {"stack": …}}`.
- Resource keys seen: `urn`, `type`, `custom`, `id`, `parent`, `provider`
  (`<provider urn>::<provider id>`), `inputs`, `outputs`, `dependencies`, `propertyDependencies`,
  `additionalSecretOutputs`, `importID`, `created`, `modified` (RFC 3339 UTC), `sourcePosition`,
  `stackTrace`. Per the schema, possibly also `protect`, `retainOnDelete`, `delete`, `external`,
  `pendingReplacement` (none set in the sample).
- Stack outputs are the `outputs` of the `pulumi:pulumi:Stack` resource.
- JSON may be indented (older CLIs, ~2× bigger) or compact (v3.27x). Parse, never compare bytes.
- The provider resource (`pulumi:providers:gcp`) inputs can hold provider credentials: treat
  provider inputs like any other value, with secrets masked.

### History entry format (`*.history.json`)

`kind` (`update`, `refresh`, `resource-import` seen; Pulumi also has `destroy`, `import`, `rename`),
`result` (`succeeded`, `failed`), `startTime`/`endTime` (Unix **seconds**), `message` (commit
message or `-m`), `resourceChanges` (`{create, update, delete, replace, same, import…}`), `version`
(always `0` in DIY: we number entries ourselves by `<unixnano>`), `config` and `environment`.

**`config` and `environment` are sensitive.** Secret config values appear as `{"secure": "v1:…"}`.
`environment` contains `git.author`, `git.author.email`, `git.committer(.email)`, the local
`runtime.executable` path, plus `git.head`, `git.headName`, `git.dirty`, `vcs.kind|owner|repo|root`,
`pulumi.version`, `pulumi.os|arch`, `exec.kind`, `runtime.*`, `updatePlan`. We expose an
allow-list only: `git.head`, `git.headName`, `git.dirty`, `vcs.*`, `pulumi.version`, `exec.kind`
and, with `project:stateiac:history:read`, the author name (not the email).

### Secrets and special values

Pulumi tags special values with the key `4dabf18193072939515e22adb298388d`:

| Signature                                                               | Meaning                                                        | We show                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `1b47061264138c4ac30d75fd1eb44270`                                      | secret: `{ciphertext}` (`plaintext` only in decrypted exports) | `[secret]`                                |
| `5cf8f73096256a8f31e491e813e4eb8e`                                      | resource reference: `{urn, id, packageVersion}`                | link to that resource                     |
| `c44067f5952c0a294b673a41bacd8c17` / `0def7320c3a5731c473e5ecbe6d01bc7` | asset / archive                                                | `[asset]` / `[archive]` with path or hash |
| `d0e6a833031e9bbcd3f4e8bde6ca49a4`                                      | output value (may wrap `secret: true`)                         | its value, or `[secret]`                  |

In the sample: 55 secret values in the current prod state (SQL passwords and every
`additionalSecretOutputs`, e.g. `effectiveLabels`/`pulumiLabels`) and 19 resource references. No
secret was ever stored in plain text. A value marked secret is replaced on the server **before**
it reaches the domain model; `ciphertext`, `secrets_providers` (salt, KMS key URLs) and `plaintext`
never leave the engine. The string `[unknown]` (`04da6b54-80e4-46f7-96ec-b56ff0331ba9`) stands for
unknown values in previews.

## Decision

### Normalized model (`domain/`, nothing Pulumi-specific)

```ts
type IacEngineKind = 'pulumi'; // later: 'terraform'

interface IacStackRef {
  backendId: string;
  engine: IacEngineKind;
  project: string | null;
  stack: string;
  layout: 'project' | 'legacy';
}

type IacValue =
  | null
  | boolean
  | number
  | string
  | IacValue[]
  | { [key: string]: IacValue }
  | { $iac: 'secret' }
  | { $iac: 'resource-ref'; address: string; id?: string }
  | { $iac: 'asset' | 'archive'; summary: string }
  | { $iac: 'unknown' };

interface IacResource {
  address: string; // Pulumi URN; Terraform resource address
  type: string;
  name: string;
  parent?: string;
  provider?: string; // provider address without the trailing ::<id>
  externalId?: string; // cloud id
  managed: boolean; // custom resource vs component
  flags: {
    protect: boolean;
    retainOnDelete: boolean;
    external: boolean;
    pendingReplacement: boolean;
    pendingDelete: boolean;
  };
  inputs: Record<string, IacValue>;
  outputs: Record<string, IacValue>;
  dependencies: string[]; // sorted, de-duplicated
  createdAt?: string;
  modifiedAt?: string;
}

interface IacSnapshot {
  ref: IacStackRef;
  source: 'current' | 'history' | 'backup' | 'retained' | 'previous' | 'object-version';
  versionId: string; // <unixnano>, object generation or S3 VersionId
  takenAt: string;
  toolVersion: string;
  resources: IacResource[];
  outputs: Record<string, IacValue>;
  pendingOperations: number;
  sizeBytes: number;
}

interface IacUpdate {
  id: string; // <unixnano> of the history file
  kind: 'update' | 'refresh' | 'destroy' | 'import' | 'rename' | 'other';
  result: 'succeeded' | 'failed' | 'in-progress';
  startedAt: string;
  endedAt?: string;
  message: string;
  changes: Partial<Record<'create' | 'update' | 'delete' | 'replace' | 'same' | 'import', number>>;
  toolVersion?: string;
  vcs?: {
    kind?: string;
    owner?: string;
    repo?: string;
    commit?: string;
    branch?: string;
    dirty?: boolean;
    author?: string;
  };
  config: Record<string, IacValue>;
  snapshotAvailable: boolean;
}

interface IacStack {
  ref: IacStackRef;
  resourceCount: number;
  lastUpdate?: IacUpdate;
  updatedAt?: string;
  toolVersion?: string;
  locked?: { since: string };
  pendingOperations: number;
  sizeBytes: number;
}

interface IacDiff {
  from: Pick<IacSnapshot, 'source' | 'versionId' | 'takenAt'>;
  to: Pick<IacSnapshot, 'source' | 'versionId' | 'takenAt'>;
  summary: { create: number; delete: number; update: number; replace: number; same: number };
  resources: Array<{
    address: string;
    type: string;
    change: 'create' | 'delete' | 'update' | 'replace';
    fields: Array<{ path: string; before?: IacValue; after?: IacValue }>;
  }>;
  outputs: Array<{ name: string; before?: IacValue; after?: IacValue }>;
}
```

Terraform mapping (for later): `address` = `module.x.aws_s3_bucket.y[0]`, `externalId` = `id`
attribute, the `outputs` of the root module, `lineage`/`serial` as `versionId`. Terraform has no
history files, so object versioning is its only diff source.

### Diff sources, in order

1. **`history/*.checkpoint.json`** (always present): the state after each update, paired with its
   `IacUpdate`. Diff entry N against N-1. Default source.
2. **Object versioning** (GCS Object Versioning / S3 Versioning) of the stack file: needed when
   history is gone and for Terraform. `pulumi stack rm` deletes the whole history directory (and the
   backups with `--remove-backups`), so versions are the only trace of a removed stack.
3. **`backups/`**: same content as the matching checkpoint, written a few hundred ms later. Only a
   fallback if a checkpoint is missing; pair it to the closest previous `<unixnano>`.
4. **`.json.bak`** and **retained copies** (`.json.<unixnano>`): "last change" without history.

### Diff normalization (measured on the sample)

A raw JSON comparison of two consecutive checkpoints flags 31–112 changed resources per update. After
normalization, it flags 0–4, which matches `resourceChanges` (e.g. `update: 2` → 2 resources).
Rules:

- Match resources by URN/address. Same address with a different `externalId` → `replace`.
- Ignore `modified`, `stackTrace`, `sourcePosition`, outputs `__pulumi_raw_state_delta` and `__meta`
  (bridge private state).
- Compare `dependencies` and each `propertyDependencies` list as sets (Pulumi reorders them).
- Every secret compares equal to every secret. **Pulumi re-encrypts with a fresh nonce on every
  write**, so a changed ciphertext means nothing and the plain value is never available. A
  secret ↔ non-secret transition is shown as a change of `[secret]`.
- Compare `provider` without the trailing `::<id>`. A provider version bump changes the provider URN
  of every resource. Show it as one change, "provider changed", instead of N updates. In the sample
  one bump produced 98 updates, mostly `provider` and a new `deletionPolicy` output.

### Reading and cost

- Discovery: `GET meta.yaml`, then list `stacks/` with delimiter `/` (project folders, then their
  stacks). Never list the whole bucket. A stack is `<name>.json`, `.json.gz` or `.json.zst`.
  Ignore `.bak`, `.json.<unixnano>` and anything else. Legacy: also `GET` each stack file to read
  the project from the URNs (cached by ETag/generation).
- Size: current states are 400–800 KB for 110–150 resources (~3–5 KB per resource, half of it in
  outputs), and the biggest is 805 KB. Every update adds three full copies (history checkpoint, backup
  and `.bak` rewrite), so this bucket holds 63 MB in 190 objects after 61 updates. A large bucket
  (50 stacks × 500 updates) means ~75 000 objects, so history is listed per stack prefix and
  paginated.
- Limit: 50 MB decompressed per object (`STATE_IAC_MAX_OBJECT_BYTES`). Bigger objects fail with a
  clear error, which also protects against gzip bombs. Gunzip while streaming, then `JSON.parse`.
- Cache, in memory only: the stack list and current states expire after a 60 s TTL and revalidate
  with a cheap `HEAD` (ETag/generation); history checkpoints and versions are immutable, so they
  are cached by key in an LRU bounded by bytes (default 256 MB). Only normalized, already-masked
  data is cached.
- Locks: listed only to show "operation in progress". Their `username`/`hostname` are not
  shown. GitOps never creates one: it does not run operations.

### Minimal read-only IAM

GCS (ADC / Workload Identity or a service account key):

- `roles/storage.objectViewer` on the bucket (`storage.objects.list`, `storage.objects.get`).
  This also covers listing and reading object versions (`versions=true`, `generation=`).
- Optional, for "Test connection" to report whether versioning is on: `storage.buckets.get`.
  Without it the test just says "unknown".
- IAM Conditions on an object prefix work for `get` but not for `list`. Use a dedicated bucket
  per sensitivity level instead of relying on prefixes.

S3 / S3-compatible (IAM role, or access key for MinIO/R2):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketVersions"],
      "Resource": "arn:aws:s3:::BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["PREFIX/.pulumi/*"] } }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::BUCKET/PREFIX/.pulumi/*"
    },
    { "Effect": "Allow", "Action": ["s3:GetBucketVersioning"], "Resource": "arn:aws:s3:::BUCKET" }
  ]
}
```

Add `kms:Decrypt` on the key if the bucket uses SSE-KMS. `s3:*Version*` and `GetBucketVersioning`
are only needed for the versioning source. No write action (`Put*`, `Delete*`,
`storage.objects.create|delete`) is ever required. "Test connection" warns if the credentials can
write, when the provider can tell (`testIamPermissions` on GCS).

### Architecture

As in the epic: `ObjectStore` (GCS, S3) knows nothing about IaC; `PulumiStateEngine` implements
`StateEngine` (`detectLayout`, `listStacks`, `readSnapshot`, `listUpdates`, `readUpdateSnapshot`,
`listVersions`) and returns only the normalized model. A `TerraformStateEngine` will implement the
same interface (`listUpdates` returns object versions). Credentials are encrypted with
`GITDB_ENCRYPTION_KEY`, like notification channels.

## Consequences

- Fixtures from a real bucket fix the format in tests. Everything not seen in the sample (gzip,
  retained copies, locks, legacy) is synthetic in the fixtures and marked as such.
- The diff is useful thanks to normalization. Without it, every update looks like a third of the
  stack changed.
- We cannot tell whether a secret changed. That is the cost of never decrypting.
- Legacy and zstd buckets are read-only edge cases. If the Pulumi format changes (checkpoint
  `version` > 3, `meta.yaml` > 1), the engine fails explicitly instead of guessing.

## Resolved decisions

1. **Cache stack metadata in GitDB?** No, not in v1. Discovery is a few list calls per
   backend and the in-memory cache with a TTL is enough. Every GitDB write is a commit; a cache that
   changes on every `pulumi up` would flood the history. Reconsider with Phase 3 if listing
   gets slow with many backends.
2. **Periodic scan and Phase 3 events in v1?** Deferred. Events (`stateiac.update.*`)
   need the same scan to detect new history entries. Build it once the read path is stable, on
   the event bus from ADR 0001.
