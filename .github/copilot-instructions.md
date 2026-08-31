# Instrucciones para GitHub Copilot

Estas instrucciones describen GitOps, un proyecto open source de plataforma interna construido
con SvelteKit. Mantener este archivo y `CLAUDE.md` equivalentes en arquitectura y comandos.

## Producto y stack

GitOps combina autenticacion y RBAC, organizaciones y proyectos, Open Report de seguridad y
visibilidad de Pulumi State. La ruta Vault es actualmente una base visual sin backend completo.
Google SSO y SAML son configuracion, no estrategias de autenticacion implementadas.

- SvelteKit 2, Svelte 5, Vite 8 y TypeScript 6 strict
- Tailwind CSS 4 y `@lucide/svelte`
- Internacionalizacion con `svelte-i18n` (español e ingles)
- Bun como package manager
- GitDB como unica capa de persistencia
- Vitest, ESLint y Prettier

Comandos:

```bash
bun install
bun run dev
bun run build
bun run check
bun run lint
bun run test
bun run format:check
```

Los tests usan Vitest con `bun run test`. No usar `bun test`: el runner nativo de Bun no carga
los aliases ni plugins de Vite/SvelteKit del proyecto.

## Arquitectura

La logica vive en `src/modules/<module>/` con `domain/`, `application/`, `infrastructure/` e
`index.ts` como composition root. El `domain/` contiene entidades (`*.domain.ts`) y datos
centralizados (`*.data.ts`) para constantes: permisos de roles, defaults de proyecto, pesos de
riesgo y mapeos de herramientas. Los modulos actuales son `auth`, `config`, `organization`,
`projects`, `storage` y `code-report`. Las rutas deben importar desde el `index.ts` publico.

GitDB es la unica fuente de verdad para usuarios, roles, API keys, organizaciones, proyectos,
metadata de storage y code reports. Se configura con `GITDB_REPOSITORY_URL` y cada escritura es
un commit auditable. Usar `getGitDb()` y `src/lib/database/schemas.ts`; no añadir otra base de
datos sin discutir la arquitectura y planificar la migracion.

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
- **Cluster Admin**: vault, openreport, stateiac (todos)
- **Cluster User**: sin permisos propios; rol base para acceso a nivel cluster
- **Organization Admin**: todos los permisos de org (proyectos, usuarios, roles, configuración global, backups, server-access-keys, audit)
- **Organization Developer**: solo read/create/update de proyectos
- **Project Admin**: metadata/usuarios/roles/server-keys/audit plus todos los permisos de módulos (vault, codereport, stateiac)
- **Project Developer/Viewer**: acceso granular a módulos con permisos diferenciados (solo lectura en Viewer)

Los permisos de organización se propagan a sus proyectos solo cuando no hay un assignment explícito a nivel de
proyecto. Un usuario con `organization:projects:read` puede satisfacer `project:project:read` en cualquier
proyecto—pero si tiene un rol específico del proyecto, ese assignment es autoritario y los permisos de org no
aplican (regla most-specific-wins). Permite delegación de autoridad granular con restricciones por-proyecto.

`canManageOrganization()` controla acceso al area `/settings`, mientras que `canViewOrganization()` incluye
tambien usuarios con acceso solo a proyectos bajo la organización (ven el overview pero no pueden acciones de org-scope).

Al crear una organizacion (via bootstrap o cluster-settings), se llama automaticamente a
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
