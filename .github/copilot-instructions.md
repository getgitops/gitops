# Instrucciones para GitHub Copilot

Estas instrucciones describen GitOps, un proyecto open source de plataforma interna construido
con SvelteKit. Mantener este archivo y `CLAUDE.md` equivalentes en arquitectura y comandos.

## Producto y stack

GitOps combina autenticacion y RBAC, organizaciones y proyectos, Open Report de seguridad y
visibilidad de Pulumi State. La ruta Vault es actualmente una base visual sin backend completo.

Google SSO es a nivel de sistema y se configura solo con variables de entorno
(`GOOGLE_SSO_CLIENT_ID`, `GOOGLE_SSO_CLIENT_SECRET` y, opcionales, `GOOGLE_SSO_ALLOWED_DOMAINS` y
`GOOGLE_SSO_AUTO_PROVISION`), leídas en cada request por `readGoogleSsoConfig()` desde
`src/modules/auth/infrastructure/config/google-sso.config.ts` en `GoogleSsoConfig`; nada se
persiste en GitDB. Si ambas credenciales están válidas, `/auth/login` muestra "Continuar con
Google" y `/org/<org>/settings/global` muestra Google SSO en solo lectura (sin exponer credenciales).
Una configuración inválida (credencial faltante, dominio inválido, inconsistencia en auto-provision)
se silencia como deshabilitada y se registra la razón; la UI nunca se rompe. `ssoService` en
`$modules/auth` ejecuta Authorization Code + PKCE (`/auth/sso/google/start` y
`/auth/sso/google/callback`, ambas sin sesión), verifica el ID token contra JWKS de Google con
`GoogleOidcClient` y autentica al usuario existente y no deshabilitado por `sub` o email verificado;
vincula el `sub` en `user.authProviders[]` y acepta invitaciones pendientes. Los dominios se
comprueban contra el claim `hd` de Workspace, no email. Con `GOOGLE_SSO_AUTO_PROVISION=true`
(requiere dominios permitidos), una cuenta Workspace desconocida recibe una cuenta GitOps User (`cluster-user`)
activa sin organización vía `userAccessService.provisionClusterUser()`. `user.disabled` solo lo
aplica Google sign-in. Templates de notificación (`src/notifications/`) se leen en tiempo de
ejecución. SAML es configuración solo.

- SvelteKit 2, Svelte 5, Vite 8 y TypeScript 6 strict
- Tailwind CSS 4 y `@lucide/svelte`
- Internacionalizacion con Paraglide JS (español e ingles)
- Bun como package manager
- GitDB como unica capa de persistencia
- Vitest, ESLint y Prettier
- Playwright para tests e2e de RBAC (`e2e/`)

Las variables de entorno se declaran en `src/env.ts` y se documentan en `.env.example`; Google SSO usa las `GOOGLE_SSO_*` descritas arriba.

Comandos:

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

Los tests usan Vitest con `bun run test`. No usar `bun test`: el runner nativo de Bun no carga
los aliases ni plugins de Vite/SvelteKit del proyecto.

Aliases de importación (`tsconfig.json`): Usar `$modules` para módulos de lógica de negocio,
`$lib` para componentes y utilidades compartidas, y rutas relativas para imports locales.
Ej: `import { userService } from '$modules/auth'` (no `../../modules/auth`).

`bun run test:e2e` ejecuta la suite RBAC de Playwright bajo `e2e/` (requiere
`bunx playwright install --with-deps chromium` una sola vez). `e2e/global-setup.ts` crea su
propio repositorio local GitDB descartable, siembra todas las personas de la matriz de permisos
e inicia el servidor dev contra él—nunca toca el repositorio configurado en `.env`. Las cookies
de sesión se emiten directamente (mismo esquema HMAC que `SessionService`), sin necesidad de
automatizar el login excepto en `e2e/specs/login.spec.ts`.

## Arquitectura

La logica vive en `src/modules/<module>/` con `domain/`, `application/`, `infrastructure/` e
`index.ts` como composition root. El `domain/` contiene entidades (`*.domain.ts`) y datos
centralizados (`*.data.ts`) para constantes: permisos de roles, defaults de proyecto, pesos de
riesgo y mapeos de herramientas. Los modulos actuales son `auth`, `config`, `organization`,
`projects`, `storage`, `code-report`, `vault`, `audit`, `alerts` y `notifications`.

**Destinatarios de email externo:** El módulo `notifications` gestiona acceso a personas sin
cuenta GitOps (vendors, mailboxes). Cada dirección es un `ExternalRecipientEntity` con estados
(`pending`, `verified`, `unsubscribed`, `blocked`). Las direcciones se confirman vía token HMAC
(7 días, single-use, rate limited 3/h por dirección). Solo se envían a direcciones verificadas
con dominio permitido (configurado en `/org/<org>/settings/notifications`). Las alertas omiten
campos sensibles y links al app para externals. Rutas públicas sin sesión: `/notifications/verify`
y `/notifications/unsubscribe` aceptan POST con tokens HMAC.

**Canales de notificación:** Alertas también posean a canales (webhooks genéricos, Slack, Google
Chat): un mensaje por canal, además de emails. Los canales se gestionan en Settings → Notifications
de org o proyecto, con permisos `organization:notifications:*` o `project:notifications:*`. Las
URLs se cifran (AES-GCM, nunca mostradas nuevamente) y solo se aceptan URLs `https` del host del
proveedor (validadas al guardar y antes de cada envío). Los mensajes omiten campos sensibles y
nunca van a canales (acceso diferente). Los reintentos solo aplican a errores de red, 429 y 5xx.
Un error permanente (4xx, URL inválida) se muestra en el canal como `lastError`.

Las rutas deben importar desde el `index.ts` publico.

GitDB es la unica fuente de verdad para usuarios, roles, API keys, organizaciones, proyectos,
metadata de storage y code reports. Se configura con `GITDB_REPOSITORY_URL` (URLs HTTPS o SSH
como `git@github.com:user/repo.git`, `git@bitbucket.org:team/repo.git`, o `git@gitlab.com:group/repo.git`)
y cada escritura es un commit auditable. Usar `getGitDb()` y `src/lib/database/schemas.ts`;
no añadir otra base de datos sin discutir la arquitectura y planificar la migracion. La imagen Docker
incluye `openssh-client` con fingerprints SSH preconfigurados para GitHub, Bitbucket y GitLab;
en produccion, asegurar que las credenciales SSH esten disponibles via `SSH_AUTH_SOCK` o directorio montado.

La variable `ORIGIN` fija el origen de la aplicacion (ej: `http://localhost:3000`) para que el
CSRF Origin check de SvelteKit no dependa del header Host, previniendo bypass en proxys.

## RBAC y seguridad

Los permisos usan `<scope>:<resource>:<action>` (ej: `organization:projects:read`, `project:vault:secrets:all`)
con scope `cluster`, `organization` o `project`. Usar siempre `can()` o `isAdmin()` desde `$modules/auth`;
`locals.user.role` es un objeto, no el string `admin`.

**Permisos de org:** `organization:projects:read`, `organization:users:read`, `organization:roles:read`,
`organization:settings:read`, `organization:backups:read`, `organization:server-keys:read`,
`organization:audit:read`, `organization:events:read`, `organization:alerts:read`,
`organization:notifications:read` (leer destinatarios externos, dominios, canales),
`organization:notifications:update` (añadir direcciones, canales, cambiar dominios).

**Permisos de proyecto:** `project:project:read`, `project:users:read`, `project:roles:read`,
`project:server-keys:read`, `project:audit:read`, `project:alerts:read`, `project:notifications:read`
(leer destinatarios externos y canales de alertas), `project:notifications:update` (añadir
direcciones y canales).

**Gating de permisos en UI:** En loaders de rutas, usar `cancanService.canSessionUser()` para verificar
permisos específicos y pasarlos a componentes como props (`canCreate`, `canUpdate`, `canDelete`) para
ocultar acciones que el usuario no puede realizar. El layout raíz (`+layout.server.ts`) calcula permisos
granulares de lectura para settings de org (proyectos, usuarios, roles, configuración, backups, servidor-keys,
audit, eventos, alertas, notificaciones) y módulos de proyecto (vault, codereport, stateiac) combinándolos
con lógica OR para obtener flags de lectura de alto nivel que se filtran en AppSidebar según acceso específico.

Roles por defecto en `src/modules/auth/domain/role-permissions.data.ts`. Los permisos incluyen scope
como prefijo y se almacenan verbatim sin transformaciones. Módulos tienen sub-permisos granulares
(ej: `project:vault:secrets:read`, `project:codereport:reports:read`):
- **GitOps Admin** (`cluster-admin`) — acceso total a vault, openreport, stateiac
- **GitOps User** (`cluster-user`) — rol base sin permisos propios para acceso a nivel sistema
- **Organization Admin** — todos los permisos de org: proyectos, usuarios, roles, settings, backups,
  server-keys, audit, eventos, alertas, notificaciones
- **Organization Developer** — solo lectura/crear/actualizar proyectos
- **Project Admin** — metadata/usuarios/roles/server-keys/audit/alertas/notificaciones; acceso total
  a módulos (vault, codereport, stateiac)
- **Project Developer** — lectura/crear/actualizar recursos; acceso granular a módulos; lee alertas
- **Project Viewer** — solo lectura: metadata, alertas, módulos

Los permisos de organización se propagan a sus proyectos solo cuando no hay assignment explícito a nivel de
proyecto (regla most-specific-wins). `canManageOrganization()` controla acceso al area `/settings`, mientras
que `canViewOrganization()` incluye usuarios con acceso solo a proyectos.

**Rutas públicas de notificaciones:** `/notifications/verify` y `/notifications/unsubscribe` aceptan POST con
tokens HMAC (permitidas sin sesión en `hooks.server.ts`) para confirmar direcciones y unsubscribirse de alertas
externas. Usan tokens stateless HMAC (signToken con `GITDB_ENCRYPTION_KEY`, TTL 90 días).

Al crear una organización (vía bootstrap o `/gitops-settings`), se llama automáticamente a
`roleService.createDefaultOrganizationRoles()`. Al crear un proyecto, se llama a
`roleService.createDefaultProjectRoles()`. Ambas operaciones inicializan sus roles por defecto.

- No guardar `.env`, credenciales Git, API keys ni secretos en el repositorio.
- Usar una `GITDB_ENCRYPTION_KEY` larga y aleatoria en produccion.
- Mantener scrypt para passwords, HMAC para sesiones y comparaciones timing-safe.
- No devolver secretos crudos por API.
- Cubrir con tests los cambios de permisos, persistencia y endpoints.

## Convenciones

Usar los patrones existentes (`*.domain.ts`, `*.service.ts`, `*.repository.ts`, `*.test.ts`),
inyeccion de dependencias y fakes en memoria. Los handlers API validan permisos primero y
normalizan errores. Ejecutar `bun run check`, `bun run lint`, `bun run test` y
`bun run format:check` antes de terminar cambios relevantes.

## Comportamiento conocido

**Imports de i18n desde notificaciones:** `#lib/server/infra/notifications/index.ts` no re-exporta
funciones i18n (`DEFAULT_MAIL_LOCALE`, `mailLocale`, `translator`, etc.) porque estas cargan
mensajes de Paraglide (requiere Vite), pero el index se importa desde `$modules/auth` que se
ejecuta fuera de Vite en tests e2e. Importar estas funciones directamente desde
`#lib/server/infra/notifications/i18n` en lugar del index principal.

**Startup y readiness del servidor:** El auth guard en `hooks.server.ts` verifica readiness via
`getServerReadyState()` antes de procesar cualquier request. Durante startup, los navegadores
reciben una página de landing "GitOps is starting" que se recarga automáticamente, mientras que
API requests reciben 503 con header `retry-after: 3`. Si startup falla, ambos reciben 503
(página HTML para navegadores, JSON con "Server failed to start" para APIs). El endpoint `/health`
(usado por e2e e infraestructura) devuelve 200 solo tras completar startup. Aplica tanto en dev
(Vite carga en la primera request) como en producción. La bootstrap state es válida solo después
que startup termina.
