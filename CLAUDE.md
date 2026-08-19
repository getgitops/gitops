# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Contexto del Proyecto

**GitVault Suite** — Internal Developer Platform (IDP) open source que combina tres áreas de producto en una única app SvelteKit:

- **Vault** (`/vault`) — gestión de secretos estilo Infisical. **Solo existe la pantalla visual (`src/routes/vault/+page.svelte`), sin modelo de datos ni backend** ("Esta pantalla es sólo la base visual" está literalmente en el código). No asumir que hay almacenamiento de secretos real.
- **Open Report** (`/open-report`) — reportes de vulnerabilidades/dependencias.
- **Pulumi State** (`/pulumi-state`) — visor de estado IaC estilo Pulumi Cloud: lee state/history/locks desde buckets S3 o GCS configurados como "storage backends".

Ver `IDEAS.md` para el roadmap largo (Guard, Ephemeral, Rotation, Drifter) — nada de eso está implementado, es solo un documento de visión.

Package manager: **Bun** (`bun.lock`). Usar `bun`, nunca `npm`/`yarn`.

---

## Stack

| Capa                | Tecnología                                              |
| ------------------- | -------------------------------------------------------- |
| Framework           | SvelteKit 2 (Svelte 4) + Vite 5                          |
| Lenguaje            | TypeScript (strict)                                      |
| Estilos             | Tailwind CSS 4 (`@tailwindcss/postcss`)                  |
| Iconos              | `lucide-svelte`                                          |
| Base de datos (auth)| gitdb (`@getgitops/gitdb`) — JSON versionado en git       |
| Base de datos (resto)| SQLite local vía `better-sqlite3` (`data/db/states.sqlite`) |
| Storage externo     | AWS S3 (`@aws-sdk/client-s3`) y GCS (`@google-cloud/storage`) — solo para leer estado Pulumi |
| Package manager     | Bun                                                       |
| Linting/formato     | ESLint (flat config) + Prettier (+ `prettier-plugin-svelte`) |
| Tests               | Vitest                                                    |
| CI/CD               | GitHub Actions (`.github/workflows/ci.yml`), rama `develop` |
| Adapter deploy      | `@sveltejs/adapter-auto`                                  |

---

## Arquitectura

### Módulos (DDD ligero)

La lógica de negocio vive en `src/modules/<nombre>/`, cada uno separado en:

| Carpeta                       | Contenido                                                              |
| ------------------------------ | ----------------------------------------------------------------------- |
| `domain/`                      | Entidades (`entities.ts`), interfaces de repositorio (`repositories.ts`), clases de dominio (`*.domain.ts`), reglas puras (sin framework) |
| `application/`                 | Servicios que orquestan el dominio (`*.service.ts`) — esto es lo que llaman las rutas |
| `infrastructure/repositories/` | Implementaciones concretas de repositorio                              |
| `index.ts`                     | **Composition root** del módulo: instancia repositorios + servicios y exporta singletons |

Módulos existentes: `auth`, `config`, `projects`, `storage`.

**Regla de acceso**: las rutas y otros módulos importan únicamente desde el `index.ts` de cada módulo (p. ej. `import { can, isAdmin, roleService } from '../../modules/auth'`), nunca de `application/`, `domain/` o `infrastructure/` directamente.

`src/lib/` contiene infraestructura transversal compartida entre módulos:

- `src/lib/server/gitdb/index.ts` — cliente singleton de gitdb (`getGitDb()`)
- `src/lib/db.ts` + `src/lib/database/` — cliente singleton de sqlite (`databaseClient`) y su interfaz (`DatabaseClient`)
- `src/lib/permissions/index.ts` — helpers RBAC (`can`, `isAdmin`, `hasPermission`, toggles de permisos)

### Dos backends de persistencia — no mezclar

1. **gitdb** (`@getgitops/gitdb`) — cada escritura es un commit al repositorio git configurado en `GITDB_REPOSITORY_URL` (clon local en `.gitdb/`, snapshot legible en `.gitdb/users.json` y `.gitdb/roles.json`). Los esquemas se definen estilo Drizzle en `src/lib/database/schemas.ts` (`UserEntity`, `RoleEntity`, `ApiKeyEntity` + `relations`) y se consultan con una API `.with({ role: true }).select().from(Entity).where(...)`. **Solo lo usa el módulo `auth`** (usuarios, roles, API keys) — es la fuente de verdad auditada y versionada de identidad. Los repositorios extienden `Repository` (`src/modules/auth/infrastructure/repositories/repository.ts`), que expone `this.db` vía `getGitDb()`.
2. **better-sqlite3** — fichero local en `data/db/states.sqlite`, creado y migrado con `ALTER TABLE` + try/catch (sin framework de migraciones) en `src/lib/db.ts`. Lo usan `config`, `projects` y todo lo relacionado con Pulumi State (stacks, states, history, credenciales de storage backend). Los repositorios reciben un `DatabaseClient` inyectado por constructor.

**Caveat verificado**: `src/lib/db.ts` también crea tablas `users`/`api_keys`/`config` en sqlite, y existen `sqlite-auth-user.repository.ts` / `sqlite-auth-config.repository.ts` en `modules/auth/infrastructure/repositories/`. Pero el wiring activo (`src/modules/auth/index.ts`) usa `UserRepository`/`RoleRepository`, que son gitdb. **Tratar las tablas y repos sqlite de auth como código muerto/legacy** salvo que se confirme lo contrario — no asumir que están sincronizados con gitdb.

Variables de entorno (`.env.example`): `GITDB_REPOSITORY_URL` (obligatoria, lanza excepción al arrancar si falta), `GITDB_ENCRYPTION_KEY` (obligatoria, ver Seguridad). Opcionales: `GITDB_AUTHOR_NAME` / `GITDB_AUTHOR_EMAIL` (autoría de los commits a gitdb).

### Rutas

`src/routes/` sigue convención SvelteKit. Endpoints API en `src/routes/api/**/+server.ts`, un directorio por recurso (`api/roles`, `api/users`, `api/projects`, `api/backends`, `api/config`, `api/auth/{login,logout}`). Rutas de UI: `vault`, `open-report`, `pulumi-state` (+ `backends`, `cli-guide`, `[...id]`), `settings/*` (solo admin: `authentication`, `roles-permissions`, `server-access-keys`, `storage`, `system-backup`), `profile`, `how-to`, `login`.

### Puerta de acceso global

`src/hooks.server.ts` en cada request:
1. Inicializa gitdb (`getGitDb()` a nivel de módulo, una sola vez).
2. Deja pasar `/login` y `/api/auth/*` sin sesión.
3. Resuelve el usuario desde la cookie `pos_session` (`authService.resolveAuthenticatedUser`); si no hay usuario válido, redirige (302) a `/login`.
4. Restringe `/settings/*` y `/api/system/*` a admins (`canAccessAdminArea`).

---

## RBAC / Permisos

Los permisos son strings `section:action` (p. ej. `vault:read`) o el atajo `section:all`, definidos en `src/lib/permissions/index.ts`:

- `section` ∈ `vault | openreport | stateiac`
- `action` ∈ `read | create | update | delete`

Los roles (y su array de `permissions`) viven en gitdb (`.gitdb/roles.json`), gestionados por `roleService`. El rol `admin` es especial: no se puede borrar (`RoleService.deleteRole` lo bloquea explícitamente) y `isAdmin(user)` comprueba `user.role.slug === 'admin'`.

**Patrón correcto en un endpoint** (todas las rutas bajo `api/roles`, `api/projects`, `api/backends` lo siguen):

```typescript
// ✅ BIEN
import { can, isAdmin } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  ...
}
```

```typescript
// ❌ MAL — así están escritas hoy api/users/+server.ts y api/users/[id]/+server.ts, y están rotas por ello
if (!locals.user || locals.user.role !== 'admin') { ... }
```

`locals.user.role` es un **objeto** `SessionRole | null` (`{ id, name, slug, permissions }`), no un string — viene de `src/modules/auth/domain/entities.ts` (`AuthenticatedUser.role: SessionRole | null`). Compararlo con el string `'admin'` nunca es `true`, así que esa condición es **siempre verdadera** y esos endpoints devuelven 403 a todo el mundo, incluidos los admins reales. Usar siempre `isAdmin(locals.user)` o `can(locals.user, 'section:action')`, nunca comparar `locals.user.role` con un string.

---

## Seguridad — patrones reales del proyecto

- **Contraseñas**: `PasswordService` (`src/modules/auth/application/password.service.ts`) usa `scrypt` (Node `crypto`), no bcrypt. Formato de hash almacenado: `scrypt$<salt-hex>$<hash-hex>`. Aplica un **pepper** = `GITDB_ENCRYPTION_KEY` concatenado a la contraseña antes de derivar (`applyPepper`). La comparación usa `crypto.timingSafeEqual` (segura contra timing attacks) — mantener ese patrón si se toca este servicio.
- **`GITDB_ENCRYPTION_KEY` es un secreto compartido con tres usos distintos**: pepper de contraseñas, clave HMAC de las sesiones (`SessionService`) y (nominalmente) clave de cifrado de gitdb. Rotarla invalida **todas** las sesiones activas y cambia el pepper de verificación de contraseñas — no tratarla como una env var trivial de eliminar o rotar sin avisar.
- **Sesión**: no es un ID de sesión con estado — es `"<userId>.<HMAC-SHA256(userId, GITDB_ENCRYPTION_KEY)>"` (`SessionService.createToken`/`parseAndVerifyToken`). Consecuencias a tener en cuenta antes de tocar este código: el token **no expira** por sí mismo (solo expira la cookie, a los 30 días — `cookies.set(..., { maxAge: 60 * 60 * 24 * 30 })`), y **no se puede revocar una sesión individual** — "logout" solo borra la cookie del cliente, el token firmado sigue siendo válido si se reutiliza. La única forma de invalidar sesiones es rotar `GITDB_ENCRYPTION_KEY` (lo que invalida todas a la vez).
- **API keys** (`ProfileService.createApiKey`): el token se genera como `gvs_<48 hex>` y se hashea con **SHA-256 simple** (`crypto.createHash('sha256')`), no scrypt/bcrypt — consistente con ser un token aleatorio de alta entropía (no una contraseña de usuario), pero es un esquema de hashing distinto al de contraseñas; no asumir que ambos usan el mismo mecanismo.
- **Credenciales de storage backends** (`accessKeyId`, `secretAccessKey`, `gcpCredentials`) se guardan **en texto plano** en sqlite (`storage_backends`), sin cifrar. `StorageBackendService.list()` las enmascara como `'***'` antes de enviarlas al cliente, y `upsert()` reconoce el sentinel `'***'` entrante para "no tocar el valor existente" (mismo patrón que `config.service`/`api/config` con `googleClientSecret`/`samlCert`). Si se añade un campo sensible nuevo a una entidad expuesta por API, replicar este patrón mask-on-read / sentinel-on-write, no devolver el secreto crudo.
- **Login**: solo soporta usuario/contraseña local (`authService.authenticate` contra gitdb). Los toggles `googleSsoEnabled` y `samlEnabled` en `InstanceConfig` (`modules/config`) son **solo configuración persistida**, sin ninguna estrategia de auth (Google/SAML) implementada en el código — no hay `passport`, `saml`, ni librerías de OAuth en `package.json`. No asumir que activar esos toggles en `/settings/authentication` cambia el comportamiento de login.

---

## Convenciones de código

### Naming — archivos (dentro de un módulo)

| Tipo                    | Patrón                  | Ejemplo                          |
| ------------------------ | ------------------------ | ---------------------------------- |
| Entidad / tipos          | `entities.ts`            | `modules/auth/domain/entities.ts`  |
| Interfaces de repositorio| `repositories.ts`        | `modules/auth/domain/repositories.ts` |
| Clase de dominio         | `*.domain.ts`            | `role.domain.ts`, `user.domain.ts` |
| Servicio de aplicación   | `*.service.ts`           | `role.service.ts`, `auth.service.ts` |
| Repositorio (impl.)      | `*.repository.ts`        | `role.repository.ts`               |
| Repositorio sqlite       | `sqlite-*.repository.ts` | `sqlite-project.repository.ts`     |
| Test                     | `*.test.ts` (colocado junto al archivo) | `role.service.test.ts`   |

### Clases de dominio

`Domain` (`modules/auth/domain/domain.ts`) es la base común: expone `id`, `createdAt`, `updatedAt` y un `toJson()` genérico (`JSON.parse(JSON.stringify(this))`). `RoleDomain`/`UserDomain` extienden `Domain` y sobrescriben `toJson()` para forma explícita. Si se crea una entidad de dominio nueva en `auth`, seguir este patrón (constructor `(data: any)` + `toJson()` propio) en vez de usar el objeto crudo de la fila de BD directamente en servicios/rutas.

### Composition root por módulo

```typescript
// modules/config/index.ts — patrón a replicar en módulos nuevos
import { databaseClient } from '$lib/db';
import { ConfigService } from './application/config.service';
import { SqliteConfigRepository } from './infrastructure/repositories/sqlite-config.repository';

const configRepository = new SqliteConfigRepository(databaseClient);
export const configService = new ConfigService(configRepository);
```

### Endpoints API

Todo handler de `+server.ts` sigue esta forma: comprobación de permiso primero, `try/catch` alrededor de la lógica, error normalizado a `json({ error: message }, { status })`:

```typescript
// ✅ patrón real, ver src/routes/api/projects/+server.ts
export async function POST({ request, locals }) {
  if (!can(locals.user, 'stateiac:create')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { name } = await request.json();
    const project = projectService.createProject(String(name || ''));
    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
```

- `@typescript-eslint/no-unused-vars` permite el escape hatch de guion bajo (`_arg`).
- Prettier: `printWidth: 100`, comillas simples, `;` obligatorio, `trailingComma: all`, plugin de Svelte.

---

## Comandos frecuentes

```bash
bun install                # instalar dependencias
bun run dev                # vite dev server
bun run build               # build de producción
bun run preview             # preview del build
bun run check                # svelte-kit sync + svelte-check (chequeo de tipos)
bun run lint                 # eslint sobre .js/.ts/.svelte
bun run format                # prettier --write .
bun run format:check          # prettier --check . (usado en CI)
bun run test                  # vitest run (una sola pasada)
bun run test:watch            # vitest en watch
```

Ejecutar un único test: `bun run test src/lib/permissions/index.test.ts` (o `bunx vitest run -t "<nombre del test>"`).

**CI** (`.github/workflows/ci.yml`, en push/PR a `develop`) solo ejecuta `lint` + `check` + `format:check`. **No ejecuta la suite de tests** — no asumir que `bun run test` pasa como gate de PR.

**Pre-commit hook** (`.husky/pre-commit`) tiene `lint`/`check` **comentados** — hoy no hace nada al commitear. No confiar en que el hook detecte errores de lint/tipos localmente.

---

## Tests — infraestructura

Los tests son unitarios con **Vitest**, colocados junto al archivo que prueban (`*.test.ts`), sin base de datos real: se usan repos fake en memoria implementando la interfaz del repositorio real, inyectados al servicio.

```typescript
// patrón real — src/modules/auth/application/role.service.test.ts
class FakeRoleRepository {
  rows: RoleDomain[] = [];
  async findAll() { return [...this.rows]; }
  async findBySlug(slug: string) { return this.rows.find((r) => r.slug === slug) ?? null; }
  // ...resto de métodos usados por el servicio bajo prueba
}

describe('RoleService', () => {
  let service: RoleService;
  beforeEach(() => {
    service = new RoleService(new FakeRoleRepository() as any, new FakeUserRepository() as any);
  });
  it('rejects an invalid permission string', async () => {
    await expect(service.createRole({ name: 'Bad', slug: 'bad', permissions: ['vault:frobnicate'] }))
      .rejects.toThrow(/Invalid permission/);
  });
});
```

Config de Vitest en `vite.config.ts` (no hay `vitest.config.ts` separado): `environment: 'node'`, `include: ['src/**/*.{test,spec}.ts']`.

---

## Problemas conocidos (verificados leyendo el código, no suposiciones)

Antes de tocar gestión de usuarios (`modules/auth`, `api/users/**`), tener en cuenta que **varias rutas están rotas hoy**:

- **`POST /api/users` está roto**: `userService.createUser` llama a `this.roleRepository.getRoleByName(input.role)`, pero `RoleRepository` no tiene ese método (solo `findByName`/`findBySlug`) → lanza `TypeError` en cualquier intento de crear usuario.
- **`PATCH`/`DELETE /api/users/[id]` están rotos**: el handler importa `userManagementService` desde `modules/auth`, pero ese módulo no exporta ningún `userManagementService` (solo `userService`) → `undefined.updateUser(...)` lanza en cualquier llamada.
- **Los guards de admin en `api/users/+server.ts` y `api/users/[id]/+server.ts` nunca dejan pasar a nadie**: comparan `locals.user.role !== 'admin'`, pero `locals.user.role` es un objeto (`SessionRole`), no un string — la comparación es siempre `true` → 403 para todos, incluidos admins reales. El resto de la API (`api/roles`, `api/projects`, `api/backends`) sí usa correctamente `isAdmin()`/`can()`. Si se arregla esta ruta, alinear con ese patrón.
- **`ProfileService.changePassword` está roto**: lee `user.passwordHash`, pero `UserDomain` (lo que devuelve `UserRepository`) solo expone `.password` (ver `UserRepository.toDomain`, que mapea `passwordHash` de la fila → `password` del dominio). `user.passwordHash` es siempre `undefined`, así que `verifyPassword` recibe un hash inválido.
- **`UserRepository.countAdmins()` está hardcodeado a devolver `0`** ("Placeholder until role extraction is implemented"). Además, `UserService.ensureNotRemovingLastAdmin` compara `targetUser.role === 'admin'`, pero `targetUser.role` es un `RoleDomain` (objeto), nunca el string `'admin'` — esa comprobación de seguridad tampoco se dispara nunca.
- **`AuthService.bootstrapDefaults()` es un no-op**: toda la creación del admin por defecto está comentada. Un checkout nuevo depende de que `.gitdb/users.json` / `.gitdb/roles.json` ya vengan poblados en el repo de gitdb configurado; no hay auto-seed de un usuario admin inicial.
- **`UserService.updateUser`**: la rama de cambio de rol está completamente comentada — llamar con `{ role: ... }` no lanza error pero tampoco cambia nada (fallo silencioso).
- **`ApiKeysService`** (`modules/auth/application/apikeys.service.ts`) es una clase vacía, no wireada en `modules/auth/index.ts` — código muerto. La gestión real de API keys (crear/listar/revocar) vive en `ProfileService`.
- Ver también "Dos backends de persistencia" arriba: tablas/repos sqlite de auth duplicados y no usados.

---

## Reglas para el asistente de IA

- **No instalar dependencias nuevas** sin antes comprobar si ya existe una alternativa en el proyecto (p. ej. no añadir otra librería de hashing si `PasswordService`/`crypto` ya resuelve el caso).
- **No "arreglar" en silencio** los bugs listados en "Problemas conocidos" como efecto colateral de otra tarea — si al tocar código relacionado se detecta que conviene arreglarlos, señalarlo explícitamente y confirmar antes de hacerlo, ya que puede cambiar comportamiento de autorización visible (p. ej. arreglar el guard de admin en `api/users` empezará a permitir peticiones que hoy son 403).
- **No mezclar los dos backends de persistencia** dentro de un mismo módulo/entidad sin justificarlo — auth es gitdb, el resto es sqlite.
- **No devolver secretos crudos en una respuesta API** (`accessKeyId`/`secretAccessKey`/`gcpCredentials`/`googleClientSecret`/`samlCert`) — seguir el patrón mask (`'***'`) + sentinel-on-write ya usado en `storage-backend.service.ts` y `api/config/+server.ts`.
- **No comparar `locals.user.role` con un string** — siempre `can(locals.user, 'section:action')` o `isAdmin(locals.user)` de `modules/auth`.
- Limitar los cambios al módulo/archivo relevante; si una tarea obliga a tocar otro módulo no relacionado, avisar antes de hacerlo.
