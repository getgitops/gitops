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
