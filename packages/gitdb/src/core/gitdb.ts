import path from 'node:path';
import { GitRepository } from '../infrastructure/git-repository.ts';
import { GitDbLogger } from '../infrastructure/logger.ts';
import { FileManager } from '../infrastructure/file-manager.ts';
import type { EntityDefinition } from './schema.ts';
import { getGlobalRelations, type RelationsRegistry } from './relations.ts';
import type { GitDbOptions } from '../types.ts';
import { DeleteQuery } from '../queries/delete-query.ts';
import { InsertQuery } from '../queries/insert-query.ts';
import { SelectQuery } from '../queries/select-query.ts';
import { UpdateQuery } from '../queries/update-query.ts';

type SelectWithContext = {
  relationsRegistry?: RelationsRegistry;
  includeRelations?: string[] | Record<string, boolean> | null;
};

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

  with(relationsRegistry: RelationsRegistry, includeRelations?: string[] | Record<string, boolean>): GitDB;
  with(includeRelations?: string[] | Record<string, boolean>): GitDB;
  with(
    relationsOrInclude?: RelationsRegistry | string[] | Record<string, boolean>,
    includeRelationsMaybe?: string[] | Record<string, boolean>,
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
      : (relationsOrInclude as string[] | Record<string, boolean> | undefined);

    return new GitDB(this.repository, this.fileManager, {
      relationsRegistry,
      includeRelations: includeRelations ?? null,
    });
  }

  select(): SelectQuery {
    return new SelectQuery((entityName) => this.fileManager.readEntityRows(entityName), {
      relationsRegistry: this.selectWithContext?.relationsRegistry,
      includeRelations: this.selectWithContext?.includeRelations,
    });
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
