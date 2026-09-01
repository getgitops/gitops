# GitOps

Open source internal developer platform for managing project operations from one place.
GitOps brings together identity and access management, code security reports, and
infrastructure state visibility in a SvelteKit application.

> This project is under active development. Some screens are prototypes and are not yet
> backed by a complete production workflow. Contributions that improve reliability,
> documentation, testing, and accessibility are especially welcome.

## What it provides

- **Identity and access**: users, organizations, projects, roles, permissions, invitations,
  sessions, and API keys.
- **Open Report**: vulnerability, SBOM, secrets, license, and service-level reporting.
- **Pulumi State**: state, history, and lock visibility through S3 and Google Cloud Storage
  backends.
- **Git-backed identity data**: authentication data and role changes are versioned through
  [gitdb](https://github.com/getgitops/gitdb).
- **Git-backed application data**: project, configuration, and report metadata are stored as
  versioned GitDB entities.

## Project status

GitOps is usable as a development project and a foundation for forks. The Vault UI is
currently a visual foundation; it does not yet provide a complete secrets storage backend.
Google SSO and SAML settings are also configuration placeholders, not active authentication
strategies. Check [IDEAS.md](IDEAS.md) for the broader roadmap.

## Stack

- SvelteKit 2 and Svelte 5
- TypeScript 6 in strict mode
- Vite 8
- Tailwind CSS 4
- Bun for package management and scripts
- gitdb for versioned identity data
- GitDB for versioned application data
- Vitest for tests
- ESLint and Prettier for quality checks

## Requirements

- Bun 1.3 or newer
- A writable local data directory
- A Git repository for gitdb identity data
- Git 2.20 or newer

Check the versions used by CI in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Quick start

```bash
git clone https://github.com/getgitops/gitops.git
cd gitops-platform
bun install
cp .env.example .env
```

Edit `.env` before starting the application. At minimum, configure:

```dotenv
GITDB_REPOSITORY_URL=git@github.com:your-org/your-gitdb-repository.git
GITDB_BRANCH=main
GITDB_DATA_PATH=./.gitdb
GITDB_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

The configured Git repository must be reachable with SSH credentials or HTTPS credentials
available to the process. Never commit `.env`, private keys, access tokens, or production data.

Start the development server:

```bash
bun run dev
```

The application is normally available at `http://localhost:5173`.

## Useful commands

```bash
bun install
bun run dev
bun run build
bun run check
bun run lint
bun run test
bun run format
bun run format:check
```

Tests are run with **Vitest** through `bun run test`. Do not use `bun test`: Bun's native test
runner does not load the Vite/SvelteKit aliases and plugins required by this project.

Run one test file or a filtered test name with Vitest:

```bash
bunx vitest run src/modules/organization/application/organization.service.test.ts
bunx vitest run -t "creates an organization"
```

## Architecture

Business logic is organized into lightweight modules under `src/modules/`:

```text
src/modules/<module>/
	domain/                    entities and business rules
	application/               use cases and services
	infrastructure/            repositories and external adapters
	index.ts                   composition root and public module API
```

Current modules include `auth`, `config`, `organization`, `projects`, and `storage`. Shared
infrastructure lives under `src/lib/`. Routes under `src/routes/` should consume module APIs
from their `index.ts` files rather than reaching into a module's internal layers.

### Persistence

GitDB is the single persistence layer. Users, roles, API keys, organizations, projects, storage
metadata, and code reports are GitDB entities stored in the configured Git repository. Every
write is auditable as a Git commit, and repositories are accessed through `getGitDb()`.

Do not introduce a second database or a second source of truth without first discussing the
architecture in an issue.

### Authorization

Permissions use the `section:action` format and can be scoped globally, to an organization, or
to a project. Use the authorization helpers exposed by `$modules/auth`:

```typescript
import { can, isAdmin } from '$modules/auth';

if (!can(locals.user, 'stateiac:read')) {
  return json({ error: 'Forbidden' }, { status: 403 });
}
```

Do not compare `locals.user.role` with the string `"admin"`; the role is a session role object.

## Testing and quality

Tests live next to the code they cover and use in-memory fakes where possible. A contribution
should include focused tests for changed behavior, especially for authorization, persistence,
API handlers, and security-sensitive code.

Before opening a pull request, run:

```bash
bun run check
bun run lint
bun run test
bun run format:check
```

### End-to-end tests

RBAC (roles/permissions across every catalog resource) is covered by a Playwright suite under
`e2e/`. It's fully self-contained: `e2e/global-setup.ts` creates a throwaway local GitDB
repository, seeds it directly with every persona the matrix needs, and starts the dev server
against it — it never touches the repository configured in your own `.env`.

```bash
bunx playwright install --with-deps chromium   # once
bun run test:e2e
bun run test:e2e:ui                            # interactive UI mode
```

## Contributing

Forks and first-time contributors are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow, branch naming, tests, issue reports, and pull request expectations.

- Use [bug reports](.github/ISSUE_TEMPLATE/bug_report.md) for reproducible defects.
- Use [feature requests](.github/ISSUE_TEMPLATE/feature_request.md) for product proposals.
- Use [security reporting](SECURITY.md) for vulnerabilities; do not publish sensitive details
  in a public issue.

## Security

Read [SECURITY.md](SECURITY.md) before deploying or handling real credentials. In particular,
use a strong `GITDB_ENCRYPTION_KEY`, protect the gitdb repository, and treat storage backend
credentials as sensitive data.

## License

GitOps is released under the [Elastic License 2.0](license.md).
