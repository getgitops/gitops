export type EntitySchema = Record<string, string>;

export type EntityDefinition<TSchema extends EntitySchema = EntitySchema> = {
  kind: 'entity';
  name: string;
  schema: TSchema;
};

export function entity<TSchema extends EntitySchema>(
  name: string,
  schema: TSchema,
): EntityDefinition<TSchema> {
  return {
    kind: 'entity',
    name,
    schema,
  };
}
