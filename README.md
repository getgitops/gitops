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
- Per-organization Google sign-in (OpenID Connect) alongside local email and password login.
- Security reporting for vulnerabilities, SBOMs, secrets, licenses, and services.
- Pulumi state, history, and lock visibility for S3 and Google Cloud Storage backends.
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

Each organization configures its own Google OAuth client:

1. In Google Cloud Console, open **APIs & Services → Credentials** and create an **OAuth client ID**
   of type **Web application** (configure the consent screen as *Internal* for Workspace-only
   access).
2. Under **Authorized redirect URIs** (not *JavaScript origins*), add
   `https://<your-host>/auth/sso/google/callback`. For local use add the URI of the port you run
   on, which must match exactly: `http://localhost:5173/auth/sso/google/callback` for
   `bun run dev`, `http://localhost:3000/auth/sso/google/callback` for Docker.
3. In GitOps, open **Organization settings → Global**, enable Google SSO, paste the client ID and
   secret, and optionally restrict sign-in to your Workspace domains. Leave the domain list empty
   for personal `@gmail.com` accounts, which carry no Workspace domain. With an *External*
   consent screen in testing mode, only the accounts listed as test users can sign in.
4. Share `https://<your-host>/auth/login?org=<organization-slug>`.

Only users already invited to the organization can sign in with Google; access and roles are still
granted through invitations. The client secret is stored encrypted with a key derived from
`GITDB_ENCRYPTION_KEY`, so rotating that key requires re-entering the secret.

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
