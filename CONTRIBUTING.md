# Contributing to GitOps

Thanks for helping improve GitOps. Contributions of code, tests, documentation, accessibility improvements, bug reports, and product feedback are welcome.

## Before you start

1. Search existing issues and pull requests.
2. For large changes, open an issue first so the direction can be discussed.
3. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

```bash
git clone https://github.com/getgitops/gitops.git
cd gitops-platform
bun install
cp .env.example .env
bun run dev
```

Use Bun for package management. Do not commit `.env`, `.gitdb`, database files, credentials, or generated build output.

## Branches and commits

Create a focused branch from the current development branch:

```bash
git switch develop
git pull --ff-only
git switch -c fix/short-description
```

Use a concise imperative commit subject, for example `Fix organization slug validation`. Keep unrelated refactors out of a feature or bug fix.

## Tests and checks

Run the relevant checks before opening a pull request:

```bash
bun run check
bun run lint
bun run test
bun run format:check
```

Tests use Vitest through `bun run test`. The native `bun test` runner does not load the Vite/SvelteKit aliases used by this project.

Add or update focused tests for changed behavior. Authorization, persistence, API handlers, and security-sensitive changes should always include tests where practical.

RBAC changes should also be covered in the Playwright suite under `e2e/` (`bun run test:e2e`,
`bunx playwright install --with-deps chromium` once beforehand). It runs against a throwaway,
self-seeded GitDB instance — see the "End-to-end tests" section in README.md.

## Pull requests

- Explain the problem and the approach.
- Link the issue when one exists.
- Keep the pull request focused and small enough to review.
- Include screenshots or a short recording for UI changes.
- Mention migrations, environment variables, security implications, and known limitations.
- Confirm that the checks above pass, or explain clearly why one cannot run.
- Make sure the branch is up to date before requesting review.

Maintainers may ask for changes, split a large pull request, or request tests and documentation before merging.

## Code conventions

Business logic belongs in `src/modules/<module>/` and should follow the existing domain/application/infrastructure structure. Routes should use the public API exported by a module's `index.ts`. GitDB is the single persistence layer and must remain the source of truth.

Prefer accessible, keyboard-friendly UI and existing project components. Avoid adding dependencies when an existing project or platform API is sufficient.

## Issues

Use the issue templates whenever possible. A useful report includes the expected behavior, actual behavior, reproduction steps, environment, relevant logs, and a small reproduction when available. Do not include secrets or personal data.
