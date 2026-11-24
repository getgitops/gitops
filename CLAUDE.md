# CLAUDE.md

Guidance for working on GitOps, an open source internal developer platform built with SvelteKit.

## Product

GitOps combines identity and access management, organizations and projects, Open Report security
analysis, and Pulumi State visibility. The Vault route is currently a UI foundation and does not
yet provide a complete secrets backend. SAML settings are configuration only.

Google SSO is system-wide and configured only through environment variables
(`GOOGLE_SSO_CLIENT_ID`, `GOOGLE_SSO_CLIENT_SECRET`, optional `GOOGLE_SSO_ALLOWED_DOMAINS` and
`GOOGLE_SSO_AUTO_PROVISION`), read on every request by `readGoogleSsoConfig()` from
`src/modules/auth/infrastructure/config/google-sso.config.ts` into a `GoogleSsoConfig` domain
object; nothing is persisted in GitDB. When both credentials are set and the config is valid, `/auth/login`
shows "Continue with Google" next to the password form, and each organization's
`/org/<org>/settings/global` shows Google SSO as enabled (read-only status, credentials never exposed).
A misconfigured provider (missing credential, invalid domain, inconsistent auto-provision settings)
silently counts as disabled and logs the reason; the UI never breaks. `ssoService` in `$modules/auth`
runs Authorization Code + PKCE through `/auth/sso/google/start` and `/auth/sso/google/callback`
(both allow unauthenticated access in `hooks.server.ts`), verifies the ID token against Google's
JWKS via `GoogleOidcClient`, and signs in any existing, non-disabled user found by Google `sub` or
verified email, linking the `sub` in `user.authProviders[]` and accepting pending invitations on
first sign-in. Allowed domains are checked against the Workspace `hd` claim, not the email suffix.
With `GOOGLE_SSO_AUTO_PROVISION=true` (requires at least one allowed domain), an unknown Workspace
account of an allowed domain gets an active GitOps User (`cluster-user`) account with no organization membership
through `userAccessService.provisionClusterUser()`; organizations still have to invite it.
`user.disabled` is currently enforced only by Google sign-in.

Self-service registration (`/auth/registration`) lets a visitor create a plain GitOps User (`cluster-user`)
account with no organization membership. It is gated by a system-wide toggle managed at
`/gitops-settings/registration` (persisted via `clusterSettingsService` in `$modules/config`,
off by default) and re-checked server-side on submit so it can't be bypassed while disabled. Once
registered and signed in, the user lands on `/org`, where the `cluster:organization:create`
permission (granted to `cluster-user` by default) surfaces a "New Organization" action that
creates the organization, provisions its default roles, and grants the creator the `org-admin`
role so they can manage what they just created.

Password recovery: `/auth/recover-password` accepts an email and, via `passwordResetService` in
`$modules/auth`, emails a time-limited reset link (`password-reset` template, 1 hour TTL, hashed
token stored on the user) without revealing whether the address is registered. The link lands on
`/auth/reset-password?token=...`, which sets a new password and redirects back to `/auth/login`.


The roadmap is in `IDEAS.md`. Do not describe roadmap items as implemented features.

## Stack and commands

- SvelteKit 2, Svelte 5, Vite 8, TypeScript 6 strict mode
- Tailwind CSS 4 and `@lucide/svelte`
- Internationalization via Paraglide JS (Spanish and English)
- Bun package manager; do not use npm or yarn
- GitDB (`@getgitops/gitdb`) as the only persistence layer
- Vitest, ESLint, and Prettier
- Playwright for RBAC end-to-end tests (`e2e/`)

Environment variables are declared in `src/env.ts` and documented in `.env.example`; Google SSO uses the `GOOGLE_SSO_*` variables described above.

Email notification templates (`src/notifications/`) are read from disk at runtime; the Docker image copies them so emails can be sent from the container.

```bash
bun install
bun run dev
bun run build
bun run check
bun run lint
bun run test
bun run test:e2e
bun run test:e2e:ui
bun run format:check
```

Tests use Vitest through `bun run test`. Do not use the native `bun test` runner: it does not load
the Vite/SvelteKit aliases and plugins used by this project.

Import aliases (`tsconfig.json`): Use `$modules` for business logic modules, `$lib` for shared
components and utilities, and relative paths for route-local imports. Examples:
`import { userService } from '$modules/auth'` (not `../../modules/auth`),
`import Button from '$lib/components/Button.svelte'`.

`bun run test:e2e` runs the Playwright RBAC suite under `e2e/` (requires
`bunx playwright install --with-deps chromium` once). `e2e/global-setup.ts` creates its own
throwaway local GitDB repository, seeds every persona the permission matrix needs, and starts the
dev server against it — it never touches the repository configured in `.env`. Session cookies are
minted directly (same HMAC scheme as `SessionService`), so specs don't need to drive the login
form except in `e2e/specs/login.spec.ts`, which covers that mechanism itself.

## UI (v3 redesign, in progress)

The redesign uses the Kettu palette (ink surfaces, `brand-500` orange `#f95d11`, Inter). `/brand` is
the live catalog of everything below; it uses the bare layout (no app sidebar/navbar) and needs a
session like any other page. Check it there before inventing a new style.

**Rule: styling is classes, behavior is components.**

- **Styling only → `k-*` classes** from `src/lib/styles/brand.css` (imported by `app.css`):
  buttons (`k-btn` + `k-btn-primary|secondary|outline-brand|ghost|danger`, sizes `k-btn-sm|lg`,
  `k-btn-icon`), inputs/textarea/native select (`k-input`, `k-label`, `k-help`), checkbox/radio
  (`k-checkbox`), badges (`k-badge` + `-brand|ok|warn|danger|info`), `k-kbd`, cards (`k-card`,
  `k-card-hover`, `k-panel`), `k-popover`, `k-divider`, navigation (`k-nav-item` with
  `aria-current="page"`, `k-nav-heading`), headings (`k-text-gradient`, `k-text-gradient-brand`).
  They work on any element (`<a>`, `<button type="submit">`…), so do not wrap them in components.
  They live in `@layer components`, so Tailwind utilities can adjust them (`k-input h-9 pl-9`).
- **Anything with behavior, focus or ARIA → `#lib/components/ui`** (import from the index):
  `Modal`, `Drawer`, `DropdownMenu` + `MenuItem`, `Select`, `Field`, `Switch`, `Tabs`
  (`underline` / `segmented`), `TagInput`, `CommandPalette`, `toast` + `Toaster`. Never hand-roll outside
  click, Esc, focus trapping or scroll locking in a page; `ui/overlay.ts` already does it (Esc only
  closes the top-most overlay).
- Every form control goes inside `Field` (label, help and error wired with `aria-describedby` /
  `aria-invalid`); spread the snippet argument on the control: `<input class="k-input" {...control} />`.
- A submit button in a `Modal` footer lives outside the `<form>`: give the form an `id` and the
  button `form="that-id"`. Put `data-autofocus` on the field that should get the initial focus.
- `Select` and `Switch` accept `name` and add a hidden input, but they need JavaScript. Forms that
  must work without JS keep a native `<select class="k-input">` / `<input type="checkbox" class="k-checkbox">`.
- Creating something from a list opens a `Modal` instead of navigating; keep the `/new` route for
  direct links and no-JS, and post the modal form to that route's actions with local result
  handling (see `monitoring/NewMonitorModal.svelte` + `MonitorForm` `variant="modal"`).
- Page pattern (see project settings): `<header>` with `h1.text-2xl` + `text-fg-muted` description
  and the primary action on the right; content in `k-card`s; success/error feedback with `toast`,
  not inline banners; every destructive action (delete, revoke, rotate, remove access) confirms in
  a `Modal` (`role="alertdialog"`), and deleting a top-level entity asks to type its name.
- Floating panels (`DropdownMenu`, `Select`, `TagInput` suggestions) render in `<body>` through
  `floating` in `ui/overlay.ts`, so no `overflow` (tables, modal bodies) clips them.
- Alerts: one alert notifies several channels (`mail`, `slack`, `google_chat`, `webhook`), one
  message each; targets live in `recipients` (`userIds`/`roleIds`/`emails`, `slackChannels`,
  `googleChatSpaces`, `webhookUrls`). Only `mail` is delivered (`DELIVERED_CHANNELS`); the rest are
  stored and validated. Create/edit happens in `AlertWizard` (modal); the `/new` and `/[id]` pages
  keep the no-JS editor (`AlertEditor`), so new alert fields must be added to both.
- `toast.*` is client-only (module state): call it from event handlers, never during SSR.
- Tokens: `bg-ink-950…500`, `brand-50…900`, text `text-fg|fg-muted|fg-subtle`, status
  `ok|warn|danger|info` (always with an icon or text, never as a chart series), chart series
  `series-1…5` in that fixed order. Use `bg-snow` for pure white: legacy `app.css` overrides
  `.bg-white`, `.bg-white/15|70|80|90`, `.border-white/15|60`, `.text-slate-*`, `.shadow-sm|md|xl`
  with `!important`, so avoid those classes in v3 code.
- **App shell (migrated to v3):** `+layout.svelte` renders `AppNavbar` (logo, ⌘K search, docs,
  account menu with "Ajustes de GitOps" for cluster admins) and `AppSidebar` as in the `/brand` mock:
  context switcher (projects grouped by organization, with search, and one "Ver todos los proyectos"
  link for the selected organization), flat sections (Proyecto:
  Dashboard + each enabled product + Ajustes; Organización), and `SidebarFooter` (version, GitDB
  status, collapse). There is no page footer. A module with several pages shows them as tabs
  (`#section-nav`) above the content. The tree lives in `#lib/navigation.ts` (`buildNavigation`) and
  feeds the sidebar, the tabs and the search: add new routes there with their permission flag
  (`sidebar: false` keeps a category out of the sidebar). The same tree builds the breadcrumbs above the tabs
  (org › project › module › page); project pages have no header of their own. The layout mounts `CommandPalette` and
  `Toaster` once; do not add another in a page. Collapsed mode is stored in `localStorage`
  (`gitops-sidebar-collapsed`); below `md` the sidebar is off-canvas. Auth, bootstrap and `/brand`
  keep the bare layout. The sidebar must stay the first `<aside>` in the DOM
  (`sidebar-visibility.spec.ts`). Pages inside the shell are still v2 until migrated one by one.
- Logo files are in `static/brand/` (`gitops-logo-dark|light.svg`, `gitops-mark-*.svg`,
  `gitops-icon.svg` and PNGs). The navbar uses the new logo; the old `gitops_logo*.png`,
  `icono_*.png` and `favicon.png` are still used elsewhere (favicon, auth pages).
- Legacy: `#lib/components/Dropdown.svelte` and the `btn-*` / `field-input` classes are v2; replace
  them with the v3 equivalents when a screen is migrated, not piecemeal.
- `e2e/specs/brand-ui.spec.ts` covers keyboard, focus and closing behavior of the UI components;
  extend it when you change them.

## Architecture

Business logic lives in `src/modules/<module>/`:

```text
 domain/                    entities, business rules, and data constants
 application/               use cases and services
 infrastructure/            repositories and adapters
 index.ts                   public API and composition root
```

Domain layers include entity classes (e.g., `*.domain.ts`) and centralized data files (e.g.,
`*.data.ts`) for configuration constants: role permissions, default project settings, risk weights,
and tool policy mappings.

Current modules include `auth`, `config`, `organization`, `projects`, `storage`,
`code-report`, `vault`, `audit`, `alerts`, and `monitoring`. Shared infrastructure lives in `src/lib/`. Routes should import module APIs from
their `index.ts`, not internal layers.

GitDB is the single source of truth. Users, roles, API keys, organizations, projects, storage
metadata, and code reports are GitDB entities in the repository configured by
`GITDB_REPOSITORY_URL`. Writes become auditable Git commits. Use `getGitDb()` and the schemas in
`src/lib/database/schemas.ts`; do not add another database or persistence backend without an
architecture discussion and migration plan.
The client behind `getGitDb()` is one per process (kept on `globalThis`): in dev the server code is
evaluated by more than one Vite module runner, and a second client would keep its own cache over
the same clone.

`GITDB_REPOSITORY_URL` supports both HTTPS and SSH URLs (e.g., `git@github.com:user/repo.git`).
The Docker image includes `openssh-client` and pre-configures the SSH key fingerprints for GitHub,
Bitbucket, and GitLab; in production, ensure SSH authentication credentials are available via
`SSH_AUTH_SOCK` or a mounted SSH directory.

`ORIGIN` environment variable pins the application's public origin (e.g., `http://localhost:3000`).
SvelteKit's CSRF Origin check depends on this value instead of deriving it from the incoming Host
header, preventing bypasses when running behind a proxy that rewrites Host headers.

## Domain events

Services announce what happened on an in-process event bus in `#lib/server/events`; the design is
in `docs/adr/0001-event-bus-and-alerts.md`.

- Names: `<module>.<resource>.<action>`, snake_case, past participle
  (`code_report.analysis.completed`, `vault.secret.created`, `access.granted`). Declare each type
  and its payload in `DomainEventMap` (`src/lib/events/domain-events.ts`, shared with the client).
- Every event needs an `EventDefinition` in the catalog (`src/lib/events/catalog/`, one
  `<module>.events.ts` per module): scope, `readPermission`, `alertable` and its filterable fields.
  `EVENT_CATALOG` is exhaustive and field keys without `derive` are checked against the payload at
  compile time. Labels are i18n keys (`events.<type>.label`, `.description`,
  `.fields.<key>`, `events.options.<group>.<value>`) and must exist in `es.json` and `en.json`
  (enforced by a test).
- Publish only **after** the GitDB write succeeded, with the right `scope`
  (`organizationId` / `projectId`). `publish()` returns immediately; handlers run asynchronously,
  in order per subscriber, and a failing handler is only logged. Use `publishAfterWrite`
  (`#lib/server/events/publish`) so resolving the scope or publishing can never fail a write that
  already succeeded; `resolveProjectScope` adds the organization to project events.
- Delivery is at-most-once and per process; events are not persisted.
- The actor comes from the request context (`userId` / `apiKeyId` set in `hooks.server.ts`),
  falling back to `system`.
- Inject `EventBus` through the service constructor from the module's `index.ts`; only composition
  roots import the `eventBus` singleton. In unit tests use `RecordingEventBus` from
  `#lib/server/events/testing`.
- Payloads **never** contain secrets (vault values, invitation/reset tokens or URLs, hashes, API
  keys), and alert recipients are always filtered with `cancanService`.
- `eventLog` (`#lib/server/events`) keeps recent events in memory for
  `/org/<org>/settings/events`, where users with `organization:events:read` see the events they
  are allowed to read (each definition's `readPermission`, checked in the event's project or
  organization) and, with `organization:events:update`, acknowledge them. Only the default
  Organization Admin role gets `organization:events:all`; existing roles are not migrated (enable
  it from the role editor). Retention: `GITOPS_EVENTS_EXPIRATION` (default `7d`). It is per
  process and cleared on restart.

## Alerts

`$modules/alerts` turns domain events into emails.

- `AlertEntity` (GitDB `alerts`): an alert watches one `eventType` from an organization
  (`scope: 'organization'`, covers every project of it) or a project. `conditions`
  (`{ field, operator, value }`) use the catalog fields, combined with `match: 'all' | 'any'`; an
  empty list always matches. Organization alerts on project events also get a `projectId` field
  (`listAlertFields`, value taken from the event scope).
- `AlertService` validates every write against the catalog and the location and throws
  `AlertValidationError` with field-level codes (`conditions.0.operator: 'invalid_operator'`):
  alertable event compatible with the scope, operators of the field, typed values, references and
  recipients (users, roles) inside the location, and **anti-escalation** (the author must hold the
  event's `readPermission`).
- `AlertEngine` subscribes to `'*'` once per process (`registerAlertEngine()` in `hooks.server.ts`,
  HMR-safe). Per event: fixed system notifications first (`system-notifications.data.ts`: access
  granted/updated/revoked to the affected user, new personal API keys to their owner, never to the
  actor, invitations skipped), then the enabled alerts of that type (cached 60 s, invalidated by
  the service) whose location covers the event and whose conditions match. A per-alert in-memory
  throttle (`throttleMinutes`) suppresses repeats and the next email reports how many were skipped.
- Recipients = selected users ∪ members with the selected roles, minus disabled users and users
  without an email, then **filtered with `cancanService.can(userId, readPermission, event scope)`**
  (most-specific-wins applies). One email per recipient (`AlertMailNotifier`); a failed email
  only affects that recipient. An organization alert and a project alert on the same event fire
  independently.
- Email (`#lib/server/infra/notifications`): every email is wrapped by `renderEmail()` in
  `src/notifications/email/_layout.html` (header, content, footer with the reason and a manage
  link). Alerts use `alert.html` (field table built from the catalog) unless the definition sets
  `mailTemplate` (`alert-code-report-analysis.html`); `link(context)` gives the app path of the
  resource and `mailSummary(payload)` the subject summary (`[GitOps] <alert>: <summary>`). System
  notices use `system-access-changed.html` / `system-security-notice.html`. Escape every user or
  event value with `{{ }}`; `{{{ }}}` only for HTML built internally with `renderTemplateString`.
  Texts are `alerts.email.*`, in the recipient's locale or English. Links are absolute with
  `ORIGIN` (`absoluteUrl()`), omitted without it. These functions never reach the client: the
  catalog endpoint strips them.
- Sending: alert and system emails go through `mailQueue` (concurrency 3, `withRetry` 4 attempts
  1 s → 4 s → 16 s with jitter, only for `isRetryableMailError`: network errors and 4xx replies).
  Definitive failures are logged by `createLogger('mail')` with the alert, the event and a
  recipient hash, never the content or the address. `registerMailShutdown()` drains it on
  `sveltekit:shutdown` (10 s). Invitations and password resets call `notify()` directly: their
  tokens must not travel through the bus or the queue. Without SMTP (`isMailConfigured()`), the
  engine skips events (debug log), warns once at startup and the alert pages show a banner.
- HTTP: `#lib/server/alerts` (`access.ts` for permissions/location/actor, `operations.ts` shared by
  the API and form actions). Routes: `GET /api/events/catalog`, `GET|POST /api/alerts`,
  `GET|PATCH|DELETE /api/alerts/[id]`, `POST /api/alerts/[id]/test` and `POST /api/alerts/test`
  (dry runs: never send, never touch the throttle). Project API keys only reach their project.

- UI: `/org/<org>/settings/alerts` and `/org/<org>/projects/<slug>/settings/alerts` (list, `new`,
  `[id]`), thin routes over `#lib/server/alerts/page.ts` (loaders and form actions `draft`, `save`,
  `test`, `toggle`, `delete`; everything works without JavaScript). Components live in
  `#lib/components/alerts/`: `ConditionBuilder` renders fields, operators and inputs only from the
  `CatalogEntry` it receives (tested with `svelte/server` in `ConditionBuilder.test.ts`; Vitest
  compiles `.svelte` through `vitest.config.ts`). Project pages also list the inherited
  organization alerts, read-only. Error codes map to `alerts.errors.<code>`.

Making an event alertable:

1. Declare the payload in `DomainEventMap` and publish it with `publishAfterWrite` and the right
   scope.
2. Add its `EventDefinition` with `alertable: true`, the correct `scope` and `readPermission`, and
   the fields people will filter on (`reference` fields need a case in `PlatformDirectory`).
3. Add the `events.<type>.*` translations in `es.json` and `en.json`.
4. Nothing else: the catalog endpoint, the validation, the engine and the UI pick it up.

## Monitoring

`$modules/monitoring` runs HTTP uptime monitors; the design is in
`docs/adr/0002-http-monitoring.md`.

- Configuration: `MonitorEntity` (main GitDB `monitors`), per project, optional `serviceId` of a
  Code Report service of the same project (unlinked when that service is deleted). Header values
  and the body are encrypted together (`monitor-secrets.ts`, vault key material, AAD = monitor id);
  only `headerNames` and `hasBody` reach the UI. A header row with an empty value keeps the stored
  value. `MonitorService` returns field-level codes in `MonitorValidationError`
  (`monitoring.errors.<code>`).
- Metrics: **never one row per check.** `monitoring_incidents` (written at once on every status
  change), `monitoring_current` (hour in progress, every `MONITORING_FLUSH_SECONDS`),
  `monitoring_hourly`, `monitoring_daily` (hours past `MONITORING_HOURLY_RETENTION_DAYS`). They go to
  `MONITORING_GITDB_REPOSITORY_URL` when set (`startSecondaryGitDb`, `#lib/server/gitdb/secondary`),
  to the main GitDB otherwise; the audit views skip `monitoring_*` (`isSystemMetricsEntity`).
  Uptime is time-based from incidents (`domain/aggregates.ts`); status and uptime are never written
  to `monitors`.
- Runtime (`MonitoringRuntime`, one per process on `globalThis`, started by `startMonitoring()`
  in `hooks.server.ts` after GitDB; a failure only disables monitoring): in-memory
  `MonitorScheduler` (stable offsets, leases of `timeout + 15 s`, 2 attempts, results accepted once
  per lease), `status-tracker.ts` (`confirmations` failing checks open an incident that starts at
  the first of them; one good check closes it), events `monitoring.monitor.down|degraded|recovered`
  (alertable, `readPermission` `project:monitoring:monitors:read`, display URL only).
- Workers: `#lib/monitoring/*` is framework-free (no aliases, `.ts` import extensions, erasable
  TypeScript only) because `src/worker/monitoring-worker.ts` runs on plain Node (`bun run worker`,
  copied into the Docker image). Keep it that way. The embedded worker
  (`MONITORING_EMBEDDED_WORKER`, default on) uses the runtime as its transport; dedicated workers
  use `POST /api/internal/monitoring/lease|results`, authenticated in `hooks.server.ts` by
  `verifyWorkerRequest` (`MONITORING_WORKER_TOKEN`, optional `MONITORING_INTERNAL_HOSTS`), never by
  API keys or sessions. Both log every finished check (`info` up, `warn` degraded/down; display URL
  only, never header values) unless `MONITORING_CHECK_LOGS=false`.
- SSRF: `runHttpCheck` checks the connected address in the DNS lookup hook and the hostname before
  that (`target-guard.ts`); the form rejects private literals too. Only
  `MONITORING_ALLOW_PRIVATE_TARGETS=true` lifts it (the e2e suite sets it). Errors and events never
  contain the URL query, credentials or header values.
- Permissions: `project:monitoring:monitors:{read,create,update,delete,test,all}`; Project Admin
  all, Developer read/create/update/test, Viewer read. The project module flag is
  `modules.monitoring` (off by default). UI: `/org/<org>/projects/<slug>/monitoring/{dashboard,
monitors, monitors/new, monitors/[id], monitors/[id]/edit}`, thin routes over
  `#lib/server/monitoring/page.ts`; components in `#lib/components/monitoring/`; the Code Report
  service page shows its monitors (`service-monitors.ts`).

## Authorization

Permission grants are always scope-prefixed and match the catalog in `src/lib/config/permissions.ts`
exactly: `<scope>:<resource path>:<action>`, where scope is `cluster`, `organization` or `project`
(`project:vault:secrets:read`, `organization:projects:create`, `cluster:users:invite`). A
`<resource>:all` grant covers every action on that resource. Grants stored before this convention
are upgraded on read by `normalizePermissionGrant` in `$lib/permissions`.

Use the helpers exported by `$modules/auth`:

```typescript
import { cancanService } from '$modules/auth';

const allowed = await cancanService.canSessionUser(locals.user, 'project:stateiac:stacks:read', {
  scope: 'project',
  projectId: project.id,
  organizationId: project.organization?.id,
});

if (!allowed) {
  return json({ error: 'Forbidden' }, { status: 403 });
}
```

**UI permission gating:** In route loaders, use `cancanService.canSessionUser()` to check specific
action permissions and pass them to components as props (`canCreate`, `canUpdate`, `canDelete`) to conditionally
render actions in the UI. This prevents users from seeing actions they cannot perform:

```typescript
const canCreate = await cancanService.canSessionUser(locals.user, 'project:roles:create', {
  scope: 'project',
  projectId: project.id,
  organizationId: project.organization?.id,
});
return { roles, canCreate };
```

The root layout (`+layout.server.ts`) calculates granular read permissions for each settings section and
passes them to the AppSidebar component, which filters sidebar items based on specific resource permissions:
- **Project level:** `project:project:read`, `project:users:read`, `project:roles:read`, `project:server-keys:read`, `project:audit:read`, `project:alerts:read`, plus module-specific permissions: `project:vault:secrets:read`, `project:vault:environments:read`, `project:codereport:reports:read`, `project:codereport:dependencies:read`, `project:codereport:vulnerabilities:read`, `project:stateiac:stacks:read`, `project:stateiac:states:read`, `project:stateiac:history:read`. High-level read flags combine granular permissions with OR logic (e.g., `canReadProjectVault = canReadProjectVaultSecrets || canReadProjectVaultEnvironments`)
- **Organization level:** `organization:projects:read`, `organization:users:read`, `organization:roles:read`, `organization:settings:read`, `organization:backups:read`, `organization:server-keys:read`, `organization:audit:read`, `organization:events:read`, `organization:alerts:read`

This ensures the UI only displays navigation items for sections the user has permission to view.

Default roles and permissions are centralized in `src/modules/auth/domain/role-permissions.data.ts`.
Permissions always include their scope as a prefix (e.g., `organization:projects:read`,
`project:vault:secrets:all`) and are stored verbatim—there is no scope-stripping transformation:
- **GitOps Admin** (`cluster-admin`) — grants vault, openreport, stateiac full access
- **GitOps User** (`cluster-user`) — no inherent permissions; base role for system-level access
- **Organization Admin** — all org-level permissions: projects, users, roles, settings, backups, server-keys, audit, events, alerts
- **Organization Developer** — read/create/update projects only
- **Project Admin** — all project-level permissions: project metadata, users, roles, server-keys, audit, alerts; plus all module permissions: vault secrets/environments, codereport reports/dependencies/vulnerabilities, stateiac stacks/states/history
- **Project Developer** — read/create/update project resources; no deletion or admin; granular module access; reads alerts
- **Project Viewer** — read-only: project metadata, alerts, all modules, vault secrets/environments, codereport reports/dependencies/vulnerabilities, stateiac stacks/states/history

Module resources have granular sub-permissions: `project:vault:secrets:read`, `project:vault:environments:read`, `project:codereport:reports:read`, `project:codereport:dependencies:read`, `project:codereport:vulnerabilities:read`, `project:stateiac:stacks:read`, `project:stateiac:states:read`, `project:stateiac:history:read`. These allow fine-grained access control within each module.

Organization-level permissions cascade into their projects only when no explicit project-level assignment exists
for that user. A user with `organization:projects:read` can satisfy a `project:project:read` check on any project
in that organization—but if they have a project-specific role assignment, that assignment is authoritative and
organization permissions do not apply (most-specific-wins rule). This allows coarse-grained org roles to delegate
authority downward, while still permitting per-project restrictions.

Two helpers distinguish organization visibility from management: `canManageOrganization()` gates the `/settings` area,
while `canViewOrganization()` also includes users whose only access is to a project under that organization
(they see the org overview, but cannot perform org-scope actions).

When creating an organization (via bootstrap or `/gitops-settings`), `roleService.createDefaultOrganizationRoles()` is
automatically invoked. When creating a project, `roleService.createDefaultProjectRoles()` is automatically invoked. Both
operations initialize their respective default roles. Keep authorization tests beside changes to permission behavior.
Machine-to-machine requests authenticate with `Authorization: Bearer gvs_...`; `hooks.server.ts`
resolves them into `locals.apiKey` and `cancanService.canApiKey()` confines a project key to its
own project.

`locals.user.role` is a session role object, not the string `admin`. Use `isAdmin()` or the `can*`
helpers. Keep authorization tests beside changes to permission behavior.

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

## Known behavior

**Server startup and readiness:** The auth guard in `hooks.server.ts` checks readiness via
`getServerReadyState()` before processing any request. During startup, browsers receive a
self-reloading "GitOps is starting" landing page, while API requests get a 503 response with
`retry-after: 3` header. If startup fails, both receive 503 Service Unavailable (HTML landing
page for browsers, JSON for APIs with "Server failed to start" message). The `/health` endpoint
(used by e2e and infrastructure probes) returns 200 only after startup completes. This applies
in both development (where Vite loads the module on the first request) and production (where no
infrastructure probe guarantees traffic is held back during startup). The bootstrap state is only
meaningful after startup completes.
