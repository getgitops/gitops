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
`projects`, `storage` y `code-report`. Las rutas deben importar desde el `index.ts` publico.

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

Los permisos usan `section:action` con scope global, de organizacion o de proyecto. Usar siempre
`can()` o `isAdmin()` desde `$modules/auth`; `locals.user.role` es un objeto, no el string
`admin`.

**Gating de permisos en UI:** En loaders de rutas, usar `cancanService.canSessionUser()` para verificar
permisos específicos y pasarlos a componentes como props (`canCreate`, `canUpdate`, `canDelete`) para
ocultar acciones que el usuario no puede realizar. El layout raíz (`+layout.server.ts`) calcula permisos
granulares de lectura para settings de org (proyectos, usuarios, roles, configuración global, backups, servidor-keys, audit)
y módulos de proyecto (vault, codereport, stateiac) combinándolos con lógica OR (`canReadProjectVault = canReadProjectVaultSecrets || canReadProjectVaultEnvironments`)
para obtener flags de lectura de alto nivel que se filtran en AppSidebar según acceso específico.

Roles por defecto en `src/modules/auth/domain/role-permissions.data.ts`. Los permisos incluyen scope
como prefijo (ej: `organization:projects:read`, `project:vault:secrets:all`) y se almacenan verbatim sin
transformaciones. Recursos de módulos tienen sub-permisos granulares (ej: `project:vault:secrets:read`, `project:vault:environments:read`):
- **GitOps Admin** (`cluster-admin`) — vault, openreport, stateiac (todos)
- **GitOps User** (`cluster-user`) — rol base sin permisos propios para acceso a nivel sistema
- **Organization Admin** — todos los permisos de org (proyectos, usuarios, roles, configuración global, backups, server-access-keys, audit)
- **Organization Developer** — solo read/create/update de proyectos
- **Project Admin** — metadata/usuarios/roles/server-keys/audit plus todos los permisos de módulos (vault, codereport, stateiac)
- **Project Developer/Viewer** — acceso granular a módulos con permisos diferenciados (solo lectura en Viewer)

Los permisos de organización se propagan a sus proyectos solo cuando no hay un assignment explícito a nivel de
proyecto. Un usuario con `organization:projects:read` puede satisfacer `project:project:read` en cualquier
proyecto—pero si tiene un rol específico del proyecto, ese assignment es autoritario y los permisos de org no
aplican (regla most-specific-wins). Permite delegación de autoridad granular con restricciones por-proyecto.

`canManageOrganization()` controla acceso al area `/settings`, mientras que `canViewOrganization()` incluye
tambien usuarios con acceso solo a proyectos bajo la organización (ven el overview pero no pueden acciones de org-scope).

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

**Startup y readiness del servidor:** El auth guard en `hooks.server.ts` espera a que `serverReady`
complete antes de procesar cualquier request. Si el startup falla, todos los requests reciben
503 Service Unavailable (JSON para API calls, texto plano para otros). Aplica tanto en dev
(Vite carga el módulo en la primera request) como en producción. La bootstrap state solo es
válida después de que startup termina.
