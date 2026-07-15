import path from 'node:path';
import { GitRepository } from '../infrastructure/git-repository.ts';
import { GitDbLogger } from '../infrastructure/logger.ts';
import { FileManager } from '../infrastructure/file-manager.ts';
import type { EntityDefinition } from './schema.ts';
import { getGlobalRelations, type RelationsRegistry } from './relations.ts';
import type { GitDbOptions } from '../types.ts';
import { DeleteQuery } from '../queries/delete-query.ts';
import { InsertQuery } from '../queries/insert-query.ts';
import { SelectQuery, type IncludeRelationsInput, type SelectFieldsInput } from '../queries/select-query.ts';
import { UpdateQuery } from '../queries/update-query.ts';
import { toPredicates, type EntityRow, type WhereInput } from '../queries/where-operators.ts';

type SelectWithContext = {
  relationsRegistry?: RelationsRegistry;
  includeRelations?: IncludeRelationsInput;
};

type AggregateWhereInput = WhereInput | WhereInput[];

export class GitDB {
  private readonly repository: GitRepository;
  private readonly fileManager: FileManager;
  private readonly selectWithContext?: SelectWithContext;

  constructor(repository: GitRepository, fileManager: FileManager, selectWithContext?: SelectWithContext) {
    this.repository = repository;
    this.fileManager = fileManager;
    this.selectWithContext = selectWithContext;
  }

  async close(): Promise<void> {
    await this.repository.shutdown();
  }

  private static createGlobalRegistry(): RelationsRegistry {
    return {
      for() {
        return {};
      },
      get(source) {
        return getGlobalRelations(source);
      },
      resolve(source, relationName) {
        return getGlobalRelations(source)[relationName];
      },
      all() {
        return {};
      },
    };
  }

  with(relationsRegistry: RelationsRegistry, includeRelations?: IncludeRelationsInput): GitDB;
  with(includeRelations?: IncludeRelationsInput): GitDB;
  with(
    relationsOrInclude?: RelationsRegistry | IncludeRelationsInput,
    includeRelationsMaybe?: IncludeRelationsInput,
  ): GitDB {
    const isRegistry =
      typeof relationsOrInclude === 'object' &&
      relationsOrInclude !== null &&
      'for' in relationsOrInclude &&
      'get' in relationsOrInclude &&
      'resolve' in relationsOrInclude;

    const relationsRegistry = isRegistry
      ? (relationsOrInclude as RelationsRegistry)
      : GitDB.createGlobalRegistry();

    const includeRelations = isRegistry
      ? includeRelationsMaybe
      : (relationsOrInclude as IncludeRelationsInput | undefined);

    return new GitDB(this.repository, this.fileManager, {
      relationsRegistry,
      includeRelations: includeRelations ?? null,
    });
  }

  select(fields?: SelectFieldsInput): SelectQuery {
    return new SelectQuery((entityName) => this.fileManager.readEntityRows(entityName), {
      relationsRegistry: this.selectWithContext?.relationsRegistry,
      includeRelations: this.selectWithContext?.includeRelations,
      selectFields: fields,
    });
  }

  async $count(entity: EntityDefinition, where?: AggregateWhereInput): Promise<number> {
    const rows = await this.loadRowsForAggregate(entity, where);
    return rows.length;
  }

  async $sum(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    return numbers.reduce((total, value) => total + value, 0);
  }

  async $avg(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    const total = numbers.reduce((accumulator, value) => accumulator + value, 0);
    return total / numbers.length;
  }

  async $max(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    return numbers.reduce((max, value) => (value > max ? value : max));
  }

  async $min(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    return numbers.reduce((min, value) => (value < min ? value : min));
  }

  insert(entity: EntityDefinition): InsertQuery {
    return new InsertQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason),
    });
  }

  update(entity: EntityDefinition): UpdateQuery {
    return new UpdateQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason),
    });
  }

  delete(entity: EntityDefinition): DeleteQuery {
    return new DeleteQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason),
    });
  }

  private async loadRowsForAggregate(entity: EntityDefinition, where?: AggregateWhereInput): Promise<EntityRow[]> {
    const rows = await this.fileManager.readEntityRows<EntityRow>(entity.name);
    if (!where) {
      return rows;
    }

    const whereList = Array.isArray(where) ? where : [where];
    if (!whereList.length) {
      return rows;
    }

    const predicates = toPredicates(whereList);
    return rows.filter((row) => predicates.every((predicate) => predicate.test(row)));
  }

  private async loadNumbersForAggregate(
    entity: EntityDefinition,
    field: string,
    where?: AggregateWhereInput,
  ): Promise<number[]> {
    const rows = await this.loadRowsForAggregate(entity, where);
    const numbers = rows
      .map((row) => row[field])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return numbers;
  }
}

export function gitDb(repositoryUrl: string, options: Partial<Omit<GitDbOptions, 'repositoryUrl'>> = {}): GitDB {
  const logger = new GitDbLogger(options.logger);

  const repository = new GitRepository({
    repositoryUrl,
    autoCommitIntervalMs: options.autoCommitIntervalMs ?? 60_000,
    immediateCommitDelayMs: options.immediateCommitDelayMs ?? 800,
    gitUserName: options.gitUserName ?? 'gitdb-bot',
    gitUserEmail: options.gitUserEmail ?? 'gitdb-bot@local',
    logger: options.logger ?? logger,
  });

  const fileManager = new FileManager(path.resolve(process.cwd(), '.gitdb'));

  void repository.initialize();

  return new GitDB(repository, fileManager);
}
