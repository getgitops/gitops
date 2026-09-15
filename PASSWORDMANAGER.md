# Password Manager — contexto e implementación

Plan de diseño para un módulo de gestión de contraseñas dentro de GitOps, siguiendo la misma
arquitectura y convenciones que el resto de la plataforma (`organization`, `projects`, `vault`).
Este documento es la referencia de diseño; no describas nada de aquí como implementado hasta que
exista el código correspondiente.

## Contexto: qué ya tenemos y qué reutilizamos

- **Organizations / Users**: el password manager cuelga de `organizationId`, igual que `projects`.
  No hace falta un nuevo concepto de "workspace"; cada organización ya es el límite natural de
  aislamiento de datos.
- **GitDB como única persistencia**: nuevas entidades en `src/lib/database/schemas.ts`, sin bases
  de datos adicionales.
- **Patrón de módulo** (`domain/ application/ infrastructure/ index.ts`) usado por `vault`,
  `organization`, `projects`, etc.
- **Cifrado por campo, no por fila**: el módulo `vault` ya cifra valores individuales con
  AES-256-GCM derivando la clave con `scrypt` desde `VAULT_ENCRYPTION_KEY`
  (`src/modules/vault/infrastructure/crypto/secret-cipher.ts`), atando el ciphertext a su fila vía
  AAD (`secretId:environmentSlug`) para que no sea reutilizable si se copia a otra fila. El
  password manager sigue el mismo patrón.
- **Permisos**: catálogo estático `scope:resource:action` en `src/lib/config/permissions.ts`
  (`cluster` | `organization` | `project`), roles (`RoleDomain`) y asignaciones (`UserAccessDomain`)
  vía `cancanService`. Esto cubre bien accesos "a nivel de sección", pero **no** cubre permisos por
  recurso individual (una bóveda concreta) — ese es el motivo de un mecanismo de acceso adicional,
  ver más abajo.
- **Audit** (`$modules/audit`): registro de eventos y cambios de fila, reutilizable para dejar
  rastro de accesos a bóvedas/ítems (crear, actualizar, revelar, borrar).

## Concepto de producto

- Cada organización tiene una **bóveda general** (`general`, creada automáticamente al crear la
  organización, no borrable) más N **bóvedas** adicionales creadas por un admin de organización.
- Cada bóveda contiene **ítems**, de dos tipos:
  - **Login**: `url(es)`, `username`, `password` (+ opcional: notas del login).
  - **Note**: un textarea libre.
- El acceso a una bóveda es explícito por bóveda: un usuario con rol de organización no ve
  automáticamente todas las bóvedas — solo la(s) que se le hayan concedido explícitamente (la
  bóveda `general` se concede por defecto a todo miembro de la organización).
- Sin API pública por ahora. Todo se sirve vía rutas SvelteKit autenticadas por sesión (`+page.server.ts`
  / `+server.ts` internos, igual que el resto de la app). La extensión de navegador y la app de
  escritorio (futuro) se plantean como clientes que embeben las páginas existentes (iframe o
  webview apuntando al origen de GitOps, reutilizando la cookie de sesión), no como consumidores de
  una API REST/token dedicada. Si en el futuro hace falta una API real (autofill nativo, CLI), se
  diseña aparte — no se prepara de antemano.

## Modelo de datos (GitDB, `src/lib/database/schemas.ts`)

```typescript
export const PasswordVaultEntity = entity('password_vaults', {
  id: uuid().primaryKey(),
  organizationId: uuid().notNull(),
  slug: text().notNull(),          // 'general' para la bóveda por defecto
  name: text().notNull(),
  description: text(),
  isDefault: bool().notNull().default(false),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});

// ACL por bóveda: independiente del catálogo de permisos por rol, porque el acceso es
// por-recurso (esta bóveda concreta), no por-sección. 'owner' puede gestionar accesos y borrar
// la bóveda; 'write' puede crear/editar/borrar ítems; 'read' solo puede ver y copiar valores.
export const PasswordVaultAccessEntity = entity('password_vault_access', {
  id: uuid().primaryKey(),
  vaultId: uuid().notNull(),
  userId: uuid().notNull(),
  level: text().notNull().default('read'), // 'owner' | 'write' | 'read'
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});

export const PasswordItemEntity = entity('password_items', {
  id: uuid().primaryKey(),
  vaultId: uuid().notNull(),
  type: text().notNull(),          // 'login' | 'note'
  name: text().notNull(),
  // 'login': { urls: string[], username: string, password: string /* cifrado */, notes?: string }
  // 'note':  { content: string /* cifrado */ }
  // los campos sensibles (password, content) se guardan cifrados con el mismo formato que
  // vault ('v1:iv:authTag:ciphertext'); el resto del payload va en claro dentro del mismo json
  data: json().notNull().$defaultFn(() => ({})),
  createdByUserId: uuid(),
  updatedByUserId: uuid(),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});
```

Notas:
- `PasswordVaultEntity.isDefault` marca la bóveda `general`; se crea junto con la organización
  (mismo punto donde hoy se provisionan los roles por defecto) y no se puede borrar.
- Al crear la bóveda `general`, se concede `level: 'owner'` (o `'write'`, a decidir) a todo usuario
  con acceso de organización existente y a cada nuevo miembro que se añada — un hook simple en el
  flujo de invitación/alta de miembros de organización.
- `PasswordItemEntity.data` solo cifra los campos secretos (password / content), no el objeto
  entero, para poder listar/buscar por `name`, `type`, `urls` sin descifrar.

## Cifrado

Nuevo módulo `src/modules/passwords/infrastructure/crypto/item-cipher.ts`, calcado de
`secret-cipher.ts` del vault:

- Algoritmo `aes-256-gcm`, clave derivada con `scrypt` desde `PASSWORDS_ENCRYPTION_KEY` (con
  fallback a `GITDB_ENCRYPTION_KEY` si se decide compartir clave raíz, a definir).
- AAD por campo: `` `${VERSION}:${itemId}:${field}` `` (`field` = `'password'` o `'content'`) para
  que un valor cifrado no sea reutilizable si se copia a otro ítem.
- Mismo formato serializado `v1:iv:authTag:ciphertext` para consistencia y para poder compartir
  utilidades de "¿está cifrado?" (`isEncryptedSecretValue`-like) entre ambos módulos si conviene
  extraerlas a `$lib`.
- **KMS (futuro)**: mismo patrón que `VaultSettingsDomain.encryptionProvider` (`gitops_kms`) —
  cuando exista, cada bóveda podrá tener su propio `encryptionProvider`, y el cifrado real pasa a
  ser envelope encryption (DEK por bóveda, envuelta por la master key de KMS) en vez de derivar
  todo de una única clave de entorno. No implementar esto en la primera fase; solo dejar el campo
  `encryptionProvider` en `PasswordVaultEntity`/settings preparado para no migrar esquema después.

## Autorización

Dos niveles, complementarios:

1. **Acceso a la sección "Passwords" de la organización**: catálogo estático nuevo bajo `organization`
   en `src/lib/config/permissions.ts`, sección `passwords` (`organization:passwords:read`,
   `...:create`, `...:update`, `...:delete` — para gestionar bóvedas en sí, no su contenido):
   ```typescript
   passwords: {
     resource: 'passwords',
     permissions: grantsFor('organization', 'passwords'),
   },
   ```
   Controla quién puede ver la lista de bóvedas y crear/borrar bóvedas — no qué hay dentro.

2. **Acceso a una bóveda concreta y su contenido**: `PasswordVaultAccessEntity` (ACL por
   usuario+bóveda, ver modelo de datos). Un nuevo servicio pequeño, p.ej.
   `passwordAccessService.levelFor(userId, vaultId): 'owner' | 'write' | 'read' | null`, que:
   - Devuelve acceso total si `cancanService.isClusterAdmin` o el usuario tiene
     `organization:passwords:all` (los admins de organización pueden ver todo, igual que hoy pueden
     ver todos los proyectos).
   - Si no, busca la fila de `PasswordVaultAccessEntity` para ese `userId` + `vaultId`.
   - Se usa en cada acción de bóveda/ítem (`read` para ver/copiar, `write` para crear/editar/
     borrar ítems, `owner` para gestionar accesos y borrar la bóveda).

No se extiende `RoleScope`/`CanCanContext` con un scope `'vault'` — el ACL por recurso vive aparte
para no acoplar el catálogo de roles (pensado para secciones) con permisos por instancia.

## Estructura del módulo

```text
src/modules/passwords/
  domain/
    password-vault.domain.ts     # PasswordVaultDomain, PasswordVaultAccessDomain
    password-item.domain.ts      # PasswordItemDomain (discriminado por `type`)
  application/
    password-vault.service.ts    # CRUD bóvedas + gestión de accesos (owner-only)
    password-item.service.ts     # CRUD ítems, cifra/descifra al leer/escribir
    password-access.service.ts   # levelFor(userId, vaultId), helpers de autorización
  infrastructure/
    crypto/item-cipher.ts
    repositories/password-vault.repository.ts
    repositories/password-item.repository.ts
  index.ts                       # composition root: passwordVaultService, passwordItemService, passwordAccessService
```

## Rutas (SvelteKit, sesión únicamente)

- `/org/[org]/passwords` — lista de bóvedas visibles para el usuario (según ACL), botón "Nueva
  bóveda" si `organization:passwords:create`.
- `/org/[org]/passwords/[vaultId]` — lista de ítems de la bóveda (nombre, tipo, urls si es login),
  passwords/contenido nunca viajan al listado — se piden en una llamada aparte al abrir/revelar un
  ítem, para poder auditar el "reveal" por separado del listado.
- `/org/[org]/passwords/[vaultId]/items/[itemId]` — detalle/edición de un ítem (login o nota).
- `/org/[org]/passwords/[vaultId]/settings` — gestión de accesos de la bóveda (solo `owner`).

Sigue las convenciones de UI existentes (`Dropdown.svelte` para selects, no `<select>` nativo).

## Auditoría

Reutilizar `$modules/audit` para registrar como mínimo: creación/borrado de bóvedas, cambios de
acceso (quién concede/revoca a quién), creación/edición/borrado de ítems, y — importante para un
password manager — el evento de "reveal"/copia de una password o nota (quién, qué ítem, cuándo),
aunque el valor en sí nunca se persista en el log.

## Fases de implementación

1. **MVP**: solo bóveda `general` por organización (auto-creada, todo miembro con acceso de
   organización tiene `write`), tipos Login y Note, cifrado AES-256-GCM con clave de entorno, sin
   ACL por bóveda todavía (se apoya en `organization:passwords:*`). Sin auditoría de "reveal" aún.
2. **Bóvedas múltiples + ACL**: creación de bóvedas adicionales, `PasswordVaultAccessEntity`,
   pantalla de gestión de accesos, permisos granulares owner/write/read.
3. **Auditoría de acceso**: eventos de reveal/copia vía `$modules/audit`.
4. **KMS / envelope encryption**: `encryptionProvider` por bóveda, migración de claves derivadas a
   KMS gestionado, rotación.
5. **Clientes externos**: extensión de navegador y app de escritorio, ambas embebiendo las rutas
   existentes (iframe/webview + sesión compartida); solo si en ese punto se necesita algo que el
   iframe no pueda dar (autofill nativo del SO, acceso offline) se evalúa una API dedicada.
