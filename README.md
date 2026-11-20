# GitOps

GitOps is an open source internal developer platform for managing identity, project operations,
security reports, and infrastructure state in one place.

Built with SvelteKit, TypeScript, and [GitDB](https://github.com/getgitops/gitdb), it keeps
operational data versioned and auditable in Git.

> GitOps is under active development. We welcome contributions that improve reliability,
> documentation, testing, accessibility, and the product experience.

## Features

- Identity and access management for users, organizations, projects, roles, permissions,
  invitations, sessions, and API keys.
- Cluster-wide Google sign-in (OpenID Connect) alongside local email and password login.
- Security reporting for vulnerabilities, SBOMs, secrets, licenses, and services.
- Pulumi state, history, and lock visibility for S3 and Google Cloud Storage backends.
- Email alerts on platform events (security analyses, vault, projects, access), with filters
  built from an event catalog.
- Git-backed, auditable application data through GitDB.

## Get started

Requirements: Bun 1.3+, Git 2.20+, and a GitDB repository accessible to your local environment.

```bash
git clone https://github.com/getgitops/gitops.git
cd gitops
bun install
cp .env.example .env
bun run dev
```

Set `GITDB_REPOSITORY_URL` and a long, random `GITDB_ENCRYPTION_KEY` in `.env`. The development
server is available at `http://localhost:5173`.

Private runtime variables are declared in `src/env.ts` and imported from `$app/env/private`.
When adding one, keep its existing consumer defaults and validation.
Logging defaults to `pino-pretty` in development and structured GCP JSON in production.
Use `LOG_MODE=standard|gcp` and `LOG_FORMAT=pretty|json` to override these defaults.

### GitDB read cache

GitOps preloads every current entity table into RAM after GitDB clones or opens the
local repository. Startup readiness includes this preload. Queries, nested relations,
and aggregates read the cache first; cache misses fall back to GitDB and repopulate it.
Cache hits do not stat or read files, reconstruct chunks, or clone entire tables before
filtering and pagination. Only the returned rows are cloned to isolate callers.

GitDB remains the source of truth for writes, schema validation, commits, and audit
history. GitOps serializes writes per entity and refreshes that entity's cache after
each write, including actor-scoped writes. Failed cache operations are logged and
fall back to GitDB without hiding persistence errors.

The cache lives entirely in `src/lib/server/gitdb/` in this application, not in the
GitDB library. `EntityCache` defines an async `get`/`set`/`delete` contract;
`MemoryEntityCache` is the default backend. `CachedGitDb` accepts another backend
through its constructor, so a future Redis adapter can use the same repository-scoped
keys without changing repositories or query callers.

This caches the current tables, not `.git` history or unrelated files. Allow enough
Node.js heap for decoded JSON and temporary write buffers (potentially several times
the repository's on-disk size); adjust `NODE_OPTIONS=--max-old-space-size=<MiB>` for
large deployments. There is no eviction or TTL by default. The current deployment
assumes a single writer: changes made outside GitOps require restarting it to rebuild
the cache. Redis alone would not add cross-process invalidation.

The Code Report service-detail page uses a single cache projection: it returns full
results only for the latest analysis of each tool and compact counters for every
completed historical analysis. Historical chart points are not truncated; full older
reports remain available from the history page. Derived counters are memoized against
immutable cache snapshots and refreshed when those snapshots change. Debug logs named
`code report service detail loaded` include loader and analysis-loading durations;
the HTTP duration also includes ancestor loaders, SSR, and response serialization.

### Docker

```bash
cp .env.example .env
docker compose up --build
```

The container is available at `http://localhost:3000` and stores persistent data in `./data`.
The image ships `git` without an SSH client, so point `GITDB_REPOSITORY_URL` at an HTTPS remote
and authenticate with `GITDB_TOKEN` (or `GITDB_USERNAME`/`GITDB_PASSWORD`); with an SSH
(`git@...`) remote the container can commit locally but cannot push.

### Google sign-in

Google sign-in is configured once for the whole cluster, through environment variables:

1. In Google Cloud Console, open **APIs & Services → Credentials** and create an **OAuth client ID**
   of type **Web application** (configure the consent screen as *Internal* for Workspace-only
   access).
2. Under **Authorized redirect URIs** (not *JavaScript origins*), add
   `https://<your-host>/auth/sso/google/callback`. For local use add the URI of the port you run
   on, which must match exactly: `http://localhost:5173/auth/sso/google/callback` for
   `bun run dev`, `http://localhost:3000/auth/sso/google/callback` for Docker.
3. Set the variables and restart GitOps:

   ```bash
   GOOGLE_SSO_CLIENT_ID=123456789-abc.apps.googleusercontent.com
   GOOGLE_SSO_CLIENT_SECRET=...
   # optional: comma-separated Google Workspace domains allowed to sign in
   GOOGLE_SSO_ALLOWED_DOMAINS=example.com
   # optional: sign up unknown Workspace accounts of the allowed domains automatically
   GOOGLE_SSO_AUTO_PROVISION=false
   ```

The login page then shows **Continue with Google**, and every organization's **Settings → Global**
shows Google SSO as enabled for the cluster. Leave `GOOGLE_SSO_ALLOWED_DOMAINS` empty to accept
personal `@gmail.com` accounts, which carry no Workspace domain. With an *External* consent screen
in testing mode, only the accounts listed as test users can sign in.

By default only existing or invited users can sign in with Google. With
`GOOGLE_SSO_AUTO_PROVISION=true` (requires at least one allowed domain), the first Google sign-in of
an unknown `@example.com` Workspace account creates a plain GitOps User (`cluster-user`) with no organization
membership; organizations still have to invite it. Personal Google accounts are never signed up
automatically, because the domain is checked against the Workspace `hd` claim, not the email
address. If the variables are inconsistent (only one credential set, an invalid domain, or
automatic sign-up without domains), the Google button is hidden and the reason is logged.

### Alerts

Organizations and projects can get an email when something happens. Alerts live in **Settings →
Alerts** of the organization (they cover all of its projects) or of a project. Each alert watches
one event, filters it on the event's fields and emails users or roles. The same event can fire an
organization alert and a project alert; each one sends its own email.

Guided example: *tell the security team when an analysis of the `api-gateway` service has critical
vulnerabilities*.

1. Open the project's **Settings → Alerts** and click **Create alert**.
2. Event: **Analysis completed** (`code_report.analysis.completed`).
3. Conditions, matching **all**: **Service** *is* `api-gateway`, and **Critical vulnerabilities**
   *greater than* `0`.
4. Recipients: the **Project Admin** role. Throttle: one email every **30** minutes at most.
5. **Test alert** shows whether an example event matches and who would get the email, without
   sending anything. Then **Create alert**.

The same alert through the API (`gvs_` project keys only manage alerts of their own project):

```bash
curl -X POST "$ORIGIN/api/alerts" \
  -H "Authorization: Bearer $GITOPS_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "projectId": "<project id>",
    "name": "Critical vulnerabilities in api-gateway",
    "eventType": "code_report.analysis.completed",
    "match": "all",
    "conditions": [
      { "field": "serviceId", "operator": "eq", "value": "<service id>" },
      { "field": "summary.critical", "operator": "gt", "value": 0 }
    ],
    "recipients": { "roleIds": ["<project-admin role id>"] },
    "throttleMinutes": 30
  }'
```

`GET /api/events/catalog?scope=project&projectId=<id>` lists the events you may alert on and their
fields. Only recipients allowed to view the event get the email, and you can only create alerts on
events you can view yourself. Some notifications are always on: users are told when their access to
an organization or project changes and when a personal API key is created on their account.

### Email

Invitations, password resets, alerts and access notices are sent by SMTP:

| Variable | Default | |
|---|---|---|
| `NOTIFICATION_SMTP_HOST` | — | Required to send email |
| `NOTIFICATION_SMTP_FROM` | — | Required, sender address |
| `NOTIFICATION_SMTP_FROM_NAME` | — | Sender display name |
| `NOTIFICATION_SMTP_PORT` | `587` | `465` turns TLS on by default |
| `NOTIFICATION_SMTP_SECURE` | port-based | Force TLS on or off |
| `NOTIFICATION_SMTP_USER` / `NOTIFICATION_SMTP_PASSWORD` | — | Set both or neither |
| `NOTIFICATION_SMTP_REJECT_UNAUTHORIZED` | `true` | `false` only for self-signed test servers |
| `ORIGIN` | — | Public URL; links in emails are absolute. Without it emails have no links |

Without SMTP nothing breaks: alerts are kept, the alert pages show a warning and the server logs
it once at startup. Alert and notice emails go through an in-process queue (3 at a time) that
retries network errors and temporary SMTP replies (4 attempts: 1 s, 4 s, 16 s) and is drained for
up to 10 s on shutdown; invitations and password resets are sent directly because their links carry
tokens. Emails are in the recipient's language when known, English otherwise.

To try them locally, start [Mailpit](https://mailpit.axllent.org/) with
`docker compose --profile mail up mailpit`, set `NOTIFICATION_SMTP_HOST=localhost`,
`NOTIFICATION_SMTP_PORT=1025` and `NOTIFICATION_SMTP_FROM=gitops@localhost`, and open
http://localhost:8025.

## Development

```bash
bun run check
bun run lint
bun run test
bun run format:check
```

Use `bun run test` for the Vitest suite. For end-to-end tests, install Playwright's Chromium
browser once with `bunx playwright install chromium`, then run `bun run test:e2e`.

## Contributing

Contributions of code, tests, documentation, accessibility improvements, bug reports, and
product feedback are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a
pull request.

- Report reproducible defects with the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- Propose product changes with the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

GitOps is released under the [Elastic License 2.0](license.md).
