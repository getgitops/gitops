import {
  and,
  type EntityRow,
  type AuditActor,
  type EntityDefinition,
  type GitDB,
  type InsertQuery,
  type UpdateQuery,
  type DeleteQuery,
  type RelationsRegistry,
} from '@getgitops/gitdb';
import { CachedEntityStore, type EntityCache } from './cache';
import { cacheSelect, type IncludeRelations, type SelectQuery } from './cached-query';
import { relations } from '#lib/database/schemas';

export class CachedGitDb {
  private readonly store: CachedEntityStore;
  private readonly startup: Promise<void>;

  constructor(
    private readonly db: GitDB,
    dataPath: string,
    cache?: EntityCache,
    store?: CachedEntityStore,
    startup?: Promise<void>,
    private readonly registry?: RelationsRegistry,
    private readonly include?: IncludeRelations,
  ) {
    this.store = store ?? new CachedEntityStore(db, dataPath, cache);
    this.startup = startup ?? this.store.warm();
    // Consumers observe startup failures through ready(), including lazily created clients.
    this.startup.catch(() => {});
  }

  ready(): Promise<void> {
    return this.startup;
  }

  as(actor: AuditActor): CachedGitDb {
    return this.scoped(this.db.as(actor), this.registry, this.include);
  }

  with(registry: RelationsRegistry, include?: IncludeRelations): CachedGitDb;
  with(include?: IncludeRelations): CachedGitDb;
  with(
    registryOrInclude?: RelationsRegistry | IncludeRelations,
    include?: IncludeRelations,
  ): CachedGitDb {
    if (isRegistry(registryOrInclude)) {
      return this.scoped(this.db.with(registryOrInclude, include), registryOrInclude, include);
    }
    // GitOps supplies its registry at composition time, so default/global relations stay available.
    return this.scoped(this.db.with(registryOrInclude), relations, registryOrInclude);
  }

  select(fields?: Parameters<GitDB['select']>[0]): SelectQuery {
    return cacheSelect(
      this.db.select(fields),
      async (name) => {
        await this.startup;
        return this.store.read(name);
      },
      fields,
      this.registry,
      this.include,
    );
  }

  /** Internal projections must not mutate snapshots; only their returned payload is cloned. */
  async projectRows<T>(
    definition: EntityDefinition,
    project: (rows: readonly Readonly<EntityRow>[]) => T,
  ): Promise<T> {
    await this.startup;
    return structuredClone(project(await this.store.read(definition.name)));
  }

  insert(entity: EntityDefinition): InsertQuery {
    return this.cacheWrite(entity, this.db.insert(entity));
  }

  update(entity: EntityDefinition): UpdateQuery {
    return this.cacheWrite(entity, this.db.update(entity));
  }

  delete(entity: EntityDefinition): DeleteQuery {
    return this.cacheWrite(entity, this.db.delete(entity));
  }

  async $count(...args: Parameters<GitDB['$count']>): Promise<number> {
    return (await this.aggregateRows(...args)).length;
  }

  async $sum(...args: Parameters<GitDB['$sum']>): Promise<number> {
    return (await this.numbers(...args)).reduce((sum, value) => sum + value, 0);
  }

  async $avg(...args: Parameters<GitDB['$avg']>): Promise<number | null> {
    const numbers = await this.numbers(...args);
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
  }

  async $min(...args: Parameters<GitDB['$min']>): Promise<number | null> {
    const numbers = await this.numbers(...args);
    return numbers.length ? numbers.reduce((min, value) => Math.min(min, value)) : null;
  }

  async $max(...args: Parameters<GitDB['$max']>): Promise<number | null> {
    const numbers = await this.numbers(...args);
    return numbers.length ? numbers.reduce((max, value) => Math.max(max, value)) : null;
  }

  async close(): Promise<void> {
    try {
      await this.startup;
    } finally {
      await this.db.close();
    }
  }

  sync(): Promise<void> {
    return this.db.sync();
  }

  getPendingCommits(): Promise<number> {
    return this.db.getPendingCommits();
  }

  isSynced(): Promise<boolean> {
    return this.db.isSynced();
  }

  auditLog(...args: Parameters<GitDB['auditLog']>): ReturnType<GitDB['auditLog']> {
    return this.db.auditLog(...args);
  }

  entityDiff(...args: Parameters<GitDB['entityDiff']>): ReturnType<GitDB['entityDiff']> {
    return this.db.entityDiff(...args);
  }

  private scoped(db: GitDB, registry?: RelationsRegistry, include?: IncludeRelations): CachedGitDb {
    return new CachedGitDb(db, '', undefined, this.store, this.startup, registry, include);
  }

  private cacheWrite<Query extends InsertQuery | UpdateQuery | DeleteQuery>(
    definition: EntityDefinition,
    query: Query,
  ): Query {
    const execute = query.execute.bind(query);
    query.execute = async () => {
      await this.startup;
      return this.store.write(definition.name, execute);
    };
    return query;
  }

  private async numbers(...args: Parameters<GitDB['$sum']>): Promise<number[]> {
    const [definition, field, conditions] = args;
    return (await this.aggregateRows(definition, conditions))
      .map((row) => row[field])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }

  private async aggregateRows(...args: Parameters<GitDB['$count']>): Promise<EntityRow[]> {
    const [definition, conditions] = args;
    await this.startup;
    const rows = await this.store.read(definition.name);
    if (!conditions) return rows;
    return rows.filter(and(...(Array.isArray(conditions) ? conditions : [conditions])).test);
  }
}

function isRegistry(value: RelationsRegistry | IncludeRelations): value is RelationsRegistry {
  return (
    value !== null &&
    typeof value === 'object' &&
    'for' in value &&
    typeof value.for === 'function' &&
    'get' in value &&
    typeof value.get === 'function' &&
    'resolve' in value &&
    typeof value.resolve === 'function' &&
    'all' in value &&
    typeof value.all === 'function'
  );
}
