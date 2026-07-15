# @kettu/gitdb

Abstraccion minima de cliente de base de datos para desacoplar servicios y repositorios del motor concreto (SQLite, Postgres, etc.).

## Instalacion

```bash
npm install @kettu/gitdb
```

## Uso

```ts
import type { DatabaseClient } from '@kettu/gitdb';

export class MyRepository {
  constructor(private readonly db: DatabaseClient) {}

  findAll() {
    return this.db.all<{ id: string }>('SELECT id FROM items');
  }
}
```

## Scripts

```bash
npm run build
npm run typecheck
npm run test
npm run demo
npm run changeset
npm run version-packages
```

## Publicacion

La publicacion se realiza via GitHub Actions con dos canales.

1. NPM (recomendado):
  - Workflow: publish-gitdb.yml
  - Manual o por tag gitdb-vX.Y.Z

2. GitHub Packages:
  - Workflow: publish-gitdb-github-packages.yml
  - Ejecucion manual workflow_dispatch

3. Release semantico automatico (sin tags manuales):
  - Workflow: gitdb-release-changesets.yml
  - Crea PR de version cuando hay archivos en .changeset
  - Publica automaticamente al mergear la PR de version

Requiere el secreto de repositorio:

- NPM_TOKEN (token con permisos de publish en npm)
