# CLAUDE.md

Guidance for working on GitOps, an open source internal developer platform built with SvelteKit.

## Product

GitOps combines identity and access management, organizations and projects, Open Report security
analysis, and Pulumi State visibility. The Vault route is currently a UI foundation and does not
yet provide a complete secrets backend. Google SSO and SAML settings are configuration only; no
external authentication strategy is implemented.

The roadmap is in `IDEAS.md`. Do not describe roadmap items as implemented features.

## Stack and commands

- SvelteKit 2, Svelte 5, Vite 8, TypeScript 6 strict mode
- Tailwind CSS 4 and `@lucide/svelte`
- Bun package manager; do not use npm or yarn
- GitDB (`@getgitops/gitdb`) as the only persistence layer
- Vitest, ESLint, and Prettier

```bash
bun install
bun run dev
bun run build
bun run check
bun run lint
bun run test
bun run format:check
```

Tests use Vitest through `bun run test`. Do not use the native `bun test` runner: it does not load
the Vite/SvelteKit aliases and plugins used by this project.

## Architecture

Business logic lives in `src/modules/<module>/`:

```text
 domain/                    entities and business rules
 application/               use cases and services
 infrastructure/            repositories and adapters
 index.ts                   public API and composition root
```

Current modules include `auth`, `config`, `organization`, `projects`, `storage`, and
`code-report`. Shared infrastructure lives in `src/lib/`. Routes should import module APIs from
their `index.ts`, not internal layers.

GitDB is the single source of truth. Users, roles, API keys, organizations, projects, storage
metadata, and code reports are GitDB entities in the repository configured by
`GITDB_REPOSITORY_URL`. Writes become auditable Git commits. Use `getGitDb()` and the schemas in
`src/lib/database/schemas.ts`; do not add another database or persistence backend without an
architecture discussion and migration plan.

## Authorization

Permissions use `section:action` and may be global, organization-scoped, or project-scoped. Use
helpers exported by `$modules/auth`:

```typescript
import { can } from '$modules/auth';

if (!can(locals.user, 'stateiac:read')) {
  return json({ error: 'Forbidden' }, { status: 403 });
}
```

`locals.user.role` is a session role object, not the string `admin`. Use `isAdmin()` or `can()`.
Keep authorization tests beside changes to permission behavior.

## Security rules

- Keep `.env`, API keys, Git credentials, session secrets, and repository credentials out of Git.
- Use a strong production `GITDB_ENCRYPTION_KEY`; the development example is not suitable for
  production.
- Preserve the existing scrypt password hashing, HMAC session signing, and timing-safe checks.
- Never return raw secrets from an API.
- Review organization, project, role, and access changes for privilege escalation.

## Code and tests

Follow the existing naming patterns: `*.domain.ts`, `*.service.ts`, `*.repository.ts`, and
`*.test.ts`. Prefer dependency injection and in-memory fakes in unit tests. Keep API handlers
permission-first and normalize errors consistently.

Before finishing a change, run the relevant checks. Do not silently fix unrelated bugs or rewrite
generated files. Update `README.md`, `CONTRIBUTING.md`, and this file when architecture or public
commands change.
