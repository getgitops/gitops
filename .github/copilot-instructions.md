# Instrucciones para GitHub Copilot en este repositorio

Este fichero da contexto a Copilot (Chat, edits, completions) sobre GitVault Suite. Equivalente a `CLAUDE.md` (usado por Claude Code) — mantener ambos sincronizados.

---

## Contexto del proyecto

**GitVault Suite** — Internal Developer Platform (IDP) open source que combina tres áreas de producto en una única app SvelteKit:

- **Vault** (`/vault`) — gestión de secretos estilo Infisical. **Solo existe la pantalla visual (`src/routes/vault/+page.svelte`), sin modelo de datos ni backend** ("Esta pantalla es sólo la base visual" está literalmente en el código). No asumir que hay almacenamiento de secretos real.
- **Open Report** (`/open-report`) — reportes de vulnerabilidades/dependencias.
- **Pulumi State** (`/pulumi-state`) — visor de estado IaC estilo Pulumi Cloud: lee state/history/locks desde buckets S3 o GCS configurados como "storage backends".

Ver `IDEAS.md` para el roadmap largo (Guard, Ephemeral, Rotation, Drifter) — nada de eso está implementado, es solo un documento de visión.

Package manager: **Bun** (`bun.lock`). Usar `bun`, nunca `npm`/`yarn`.

## Stack

- Framework: SvelteKit 2 (Svelte 4) + Vite 5, TypeScript strict
- Estilos: Tailwind CSS 4, iconos `@lucide/svelte`
- Base de datos (auth): gitdb (`@getgitops/gitdb`) — JSON versionado en git
- Base de datos (resto): SQLite local vía `better-sqlite3` (`data/db/states.sqlite`)
- Storage externo: AWS S3 (`@aws-sdk/client-s3`) y GCS (`@google-cloud/storage`) — solo para leer estado Pulumi
- Linting/formato: ESLint (flat config) + Prettier (+ `prettier-plugin-svelte`)
- Tests: Vitest
- CI/CD: GitHub Actions (`.github/workflows/ci.yml`), rama `develop`

## Arquitectura

### Módulos (DDD ligero)

La lógica de negocio vive en `src/modules/<nombre>/` (`auth`, `config`, `projects`, `storage`), cada uno separado en:

- `domain/` — entidades (`entities.ts`), interfaces de repositorio (`repositories.ts`), clases de dominio (`*.domain.ts`)
- `application/` — servicios que orquestan el dominio (`*.service.ts`) — esto es lo que llaman las rutas
- `infrastructure/repositories/` — implementaciones concretas de repositorio
- `index.ts` — composition root del módulo: instancia repositorios + servicios y exporta singletons

Las rutas y otros módulos importan únicamente desde el `index.ts` de cada módulo (p. ej. `import { can, isAdmin, roleService } from '$modules/auth'`), nunca de `application/`, `domain/` o `infrastructure/` directamente.

`src/lib/` contiene infraestructura transversal: `src/lib/server/gitdb/index.ts` (cliente gitdb, `getGitDb()`), `src/lib/db.ts` + `src/lib/database/` (cliente sqlite `databaseClient`), `src/lib/permissions/index.ts` (helpers RBAC).

### Dos backends de persistencia — no mezclar

1. **gitdb** — cada escritura es un commit al repositorio git de `GITDB_REPOSITORY_URL` (clon local en `.gitdb/`, snapshot en `.gitdb/users.json` y `.gitdb/roles.json`). Esquemas estilo Drizzle en `src/lib/database/schemas.ts`. **Solo lo usa el módulo `auth`** (usuarios, roles, API keys).
2. **better-sqlite3** — fichero local `data/db/states.sqlite`, migrado con `ALTER TABLE` + try/catch en `src/lib/db.ts`. Lo usan `config`, `projects` y todo lo de Pulumi State.

**Caveat verificado**: existen tablas `users`/`api_keys`/`config` en sqlite y repos `sqlite-auth-*.repository.ts` en `modules/auth`, pero el wiring activo usa gitdb. Tratar las tablas/repos sqlite de auth como código muerto salvo que se confirme lo contrario.

Env vars (`.env.example`): `GITDB_REPOSITORY_URL` (obligatoria), `GITDB_ENCRYPTION_KEY` (obligatoria, ver Seguridad).

### Puerta de acceso global

`src/hooks.server.ts`: inicializa gitdb, resuelve usuario desde la cookie `pos_session`, redirige a `/login` si no hay sesión, y restringe `/settings/*` + `/api/system/*` a admins.

## RBAC / Permisos

Permisos = strings `section:action` (`vault|openreport|stateiac` : `read|create|update|delete`) o el atajo `section:all`, definidos en `src/lib/permissions/index.ts`. Roles en gitdb (`.gitdb/roles.json`), gestionados por `roleService`.

```typescript
// ✅ patrón correcto en un endpoint (api/roles, api/projects, api/backends)
import { can, isAdmin } from '$modules/auth';
if (!can(locals.user, 'stateiac:read')) return json({ error: 'Forbidden' }, { status: 403 });
```

```typescript
// ❌ roto — así están hoy api/users/+server.ts y api/users/[id]/+server.ts
if (!locals.user || locals.user.role !== 'admin') { ... }
```

`locals.user.role` es un **objeto** `SessionRole | null`, no un string — comparar con `'admin'` es siempre falso `===`/siempre verdadero `!==`. Usar siempre `isAdmin(locals.user)` o `can(locals.user, 'section:action')`.

## Seguridad — patrones reales del proyecto

- **Contraseñas**: `PasswordService` usa `scrypt` (no bcrypt), formato `scrypt$<salt>$<hash>`, con un pepper = `GITDB_ENCRYPTION_KEY`. Comparación con `crypto.timingSafeEqual`.
- **`GITDB_ENCRYPTION_KEY`** es un secreto compartido: pepper de contraseñas + clave HMAC de sesión + clave de gitdb. Rotarla invalida todas las sesiones.
- **Sesión**: token = `"<userId>.<HMAC-SHA256(userId, GITDB_ENCRYPTION_KEY)>"`, sin estado. No expira por sí mismo y no se puede revocar una sesión individual — "logout" solo borra la cookie.
- **API keys**: token `gvs_<48 hex>` hasheado con SHA-256 simple (no scrypt) — esquema distinto al de contraseñas.
- **Credenciales de storage backends** (S3/GCS) se guardan **en texto plano** en sqlite. Se enmascaran como `'***'` al leer y el sentinel `'***'` en escritura significa "no tocar el valor existente" — replicar este patrón para cualquier campo sensible nuevo, nunca devolver el secreto crudo.
- **Login**: solo usuario/contraseña local. Los toggles de Google SSO/SAML en `/settings/authentication` son solo configuración persistida — no hay ninguna estrategia de auth externa implementada.

## Convenciones de código

- Naming: `entities.ts`, `repositories.ts` (interfaces), `*.domain.ts`, `*.service.ts`, `*.repository.ts` (`sqlite-*.repository.ts` para sqlite), `*.test.ts` colocado junto al archivo.
- `Domain` (`modules/auth/domain/domain.ts`) es la clase base de dominio: `id`, `createdAt`, `updatedAt`, `toJson()`.
- Todo handler `+server.ts`: comprobación de permiso primero, `try/catch`, error normalizado a `json({ error: message }, { status })`.
- `@typescript-eslint/no-unused-vars` permite el escape hatch de guion bajo (`_arg`).
- Prettier: `printWidth: 100`, comillas simples, `;` obligatorio, `trailingComma: all`.

## Comandos frecuentes

```bash
bun install
bun run dev
bun run build
bun run check          # svelte-kit sync + svelte-check
bun run lint
bun run format
bun run test            # vitest run
bun run test src/lib/permissions/index.test.ts   # un único fichero
```

**CI** solo ejecuta `lint` + `check` + `format:check` — no ejecuta tests. **Pre-commit hook** (`.husky/pre-commit`) tiene `lint`/`check` comentados, hoy no hace nada.

## Tests

Vitest, colocados junto al archivo (`*.test.ts`), sin base de datos real — repos fake en memoria inyectados al servicio bajo prueba. Config en `vite.config.ts` (`environment: 'node'`).

## Problemas conocidos (verificados en el código)

- **`POST /api/users` roto**: `userService.createUser` llama a `roleRepository.getRoleByName(...)`, método que no existe (solo `findByName`/`findBySlug`).
- **`PATCH`/`DELETE /api/users/[id]` rotos**: importan `userManagementService` desde `modules/auth`, que no exporta eso (solo `userService`).
- **Guards de admin en `api/users/**` siempre devuelven 403**: comparan `locals.user.role !== 'admin'` contra un objeto, no un string.
- **`ProfileService.changePassword` roto**: lee `user.passwordHash`, pero `UserDomain` solo expone `.password`.
- **`UserRepository.countAdmins()` hardcodeado a `0`**, y la comprobación de "no borrar al último admin" compara un objeto contra el string `'admin'` — nunca se dispara.
- **`AuthService.bootstrapDefaults()` es un no-op** — no hay auto-creación de admin; depende de que gitdb ya venga poblado.
- **`UserService.updateUser`**: cambio de rol comentado — no lanza error pero tampoco hace nada.
- **`ApiKeysService`** es una clase vacía sin usar — la gestión real de API keys vive en `ProfileService`.
- Ver "Dos backends de persistencia": tablas/repos sqlite de auth duplicados y sin usar.

## Reglas para el asistente de IA

- No instalar dependencias nuevas sin comprobar antes si ya existe una alternativa en el proyecto.
- No arreglar en silencio los bugs de "Problemas conocidos" como efecto colateral de otra tarea — señalarlo y confirmar antes, puede cambiar comportamiento de autorización visible.
- No mezclar los dos backends de persistencia dentro de un mismo módulo/entidad sin justificarlo.
- No devolver secretos crudos en una respuesta API — seguir el patrón mask (`'***'`) + sentinel-on-write.
- No comparar `locals.user.role` con un string — usar `can()`/`isAdmin()`.
- Limitar los cambios al módulo/archivo relevante; avisar antes de tocar otro módulo no relacionado.
