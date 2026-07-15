import type { EntityDefinition } from './schema.ts';

export type RelationKind = 'one' | 'many';

export type BaseRelationConfig = {
  fields?: string[];
  references?: string[];
  relationName?: string;
};

export type OneRelationConfig = {
  fields: string[];
  references: string[];
  relationName?: string;
};

export type ManyRelationConfig = BaseRelationConfig;

export type RelationDefinition = {
  kind: RelationKind;
  sourceEntity: string;
  targetEntity: string;
  fields: string[];
  references: string[];
  relationName?: string;
};

export type EntityRelations = Record<string, RelationDefinition>;

export type RelationHelpers = {
  one: (target: EntityDefinition, config: OneRelationConfig) => RelationDefinition;
  many: (target: EntityDefinition, config?: ManyRelationConfig) => RelationDefinition;
};

export type RelationsRegistry = {
  for: (source: EntityDefinition, build: (helpers: RelationHelpers) => EntityRelations) => EntityRelations;
  get: (source: EntityDefinition | string) => EntityRelations;
  resolve: (source: EntityDefinition | string, relationName: string) => RelationDefinition | undefined;
  all: () => Record<string, EntityRelations>;
};

const globalRelationsByEntity: Record<string, EntityRelations> = {};

function getEntityName(entity: EntityDefinition | string): string {
  return typeof entity === 'string' ? entity : entity.name;
}

function assertFieldsExist(entity: EntityDefinition, fields: string[], label: string): void {
  for (const field of fields) {
    if (!(field in entity.schema)) {
      throw new Error(`Relation ${label} field '${field}' does not exist in entity '${entity.name}'`);
    }
  }
}

function buildRelation(
  kind: RelationKind,
  source: EntityDefinition,
  target: EntityDefinition,
  config: BaseRelationConfig,
): RelationDefinition {
  const fields = config.fields ?? [];
  const references = config.references ?? [];

  if (kind === 'one' && (!fields.length || !references.length)) {
    throw new Error(`Relation one(${target.name}) requires fields and references`);
  }

  if ((fields.length > 0 || references.length > 0) && fields.length !== references.length) {
    throw new Error(`Relation ${kind}(${target.name}) requires fields and references with same length`);
  }

  assertFieldsExist(source, fields, 'source');
  assertFieldsExist(target, references, 'target');

  return {
    kind,
    sourceEntity: source.name,
    targetEntity: target.name,
    fields,
    references,
    relationName: config.relationName,
  };
}

export function defineRelations(): RelationsRegistry {
  const relationsByEntity: Record<string, EntityRelations> = {};

  return {
    for(source, build) {
      const helpers: RelationHelpers = {
        one(target, config) {
          return buildRelation('one', source, target, config);
        },
        many(target, config = {}) {
          return buildRelation('many', source, target, config);
        },
      };

      const entityRelations = build(helpers);
      relationsByEntity[source.name] = entityRelations;
      globalRelationsByEntity[source.name] = entityRelations;
      return entityRelations;
    },

    get(source) {
      return relationsByEntity[getEntityName(source)] ?? {};
    },

    resolve(source, relationName) {
      const entityRelations = relationsByEntity[getEntityName(source)] ?? {};
      return entityRelations[relationName];
    },

    all() {
      return { ...relationsByEntity };
    },
  };
}

export function getGlobalRelations(source: EntityDefinition | string): EntityRelations {
  return globalRelationsByEntity[getEntityName(source)] ?? {};
}
