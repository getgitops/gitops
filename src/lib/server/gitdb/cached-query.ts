import { and, type EntityRow, type GitDB, type RelationsRegistry } from '@getgitops/gitdb';

export type SelectQuery = ReturnType<GitDB['select']>;
export type SelectResult = Awaited<ReturnType<SelectQuery['execute']>>;
export type IncludeRelations = Parameters<GitDB['with']>[0];
type LoadRows = (name: string) => Promise<EntityRow[]>;

/** GitDB exposes query state but not its SelectQuery constructor; only evaluation lives here. */
export function cacheSelect(
  query: SelectQuery,
  loadRows: LoadRows,
  fields?: Parameters<GitDB['select']>[0],
  registry?: RelationsRegistry,
  include?: IncludeRelations,
): SelectQuery {
  const selection = new CachedSelection(query, loadRows, fields, registry, include);
  // Decorate the public execution boundary; GitDB retains its fluent builder and Promise API.
  query.execute = () => selection.execute();
  return query;
}

class CachedSelection {
  constructor(
    private readonly query: SelectQuery,
    private readonly loadRows: LoadRows,
    private readonly fields?: Parameters<GitDB['select']>[0],
    private readonly registry?: RelationsRegistry,
    private readonly include?: IncludeRelations,
  ) {}

  async execute(): Promise<SelectResult> {
    const state = this.query.toJSON();
    if (!state.from) throw new Error('select().from(...) is required before execute()');

    let rows = await this.loadRows(state.from.name);
    if (state.where.length) rows = rows.filter(and(...state.where).test);
    if (state.having.length && !state.groupBy.length) {
      throw new Error('having() requires groupBy(...) before execute()');
    }
    if (state.groupBy.length) {
      const groups = new Map<string, { first: EntityRow; count: number }>();
      for (const row of rows) {
        const key = JSON.stringify(state.groupBy.map((field) => row[field]));
        const group = groups.get(key);
        if (group) group.count++;
        else groups.set(key, { first: row, count: 1 });
      }
      rows = [...groups.values()].map(({ first, count }) => ({
        $count: count,
        ...Object.fromEntries(state.groupBy.map((field) => [field, first[field]])),
      }));
      if (state.having.length) rows = rows.filter(and(...state.having).test);
    }
    if (state.orderBy.length) {
      rows = [...rows].sort((left, right) => {
        for (const { field, direction } of state.orderBy) {
          const comparison = compare(left[field], right[field]);
          if (comparison) return direction === 'asc' ? comparison : -comparison;
        }
        return 0;
      });
    }
    if (state.offset !== undefined) rows = rows.slice(state.offset);
    if (state.limit !== undefined) rows = rows.slice(0, state.limit);
    if (!state.groupBy.length && this.registry) {
      const targets = new Map<string, Promise<EntityRow[]>>();
      const load = (name: string) => {
        let target = targets.get(name);
        if (!target) {
          target = this.loadRows(name);
          targets.set(name, target);
        }
        return target;
      };
      rows = await this.hydrate(rows, state.from.name, this.include, load);
    }
    if (this.fields) {
      const selected = Object.entries(this.fields)
        .filter(([, enabled]) => enabled)
        .map(([field]) => field);
      rows = rows.map((row) =>
        Object.fromEntries(
          selected.filter((field) => field in row).map((field) => [field, row[field]]),
        ),
      );
    }
    // Clone only the result, not the whole multi-GB table before filtering/pagination.
    return { entity: state.from.name, rows: structuredClone(rows), state };
  }

  private async hydrate(
    rows: EntityRow[],
    source: string,
    include: IncludeRelations,
    load: LoadRows,
  ): Promise<EntityRow[]> {
    const definitions = this.registry?.get(source) ?? {};
    const selected: [string, boolean | Exclude<IncludeRelations, string[] | null | undefined>][] =
      !include
        ? Object.keys(definitions).map((name) => [name, true])
        : Array.isArray(include)
          ? include.map((name) => [name, true])
          : Object.entries(include);
    const results: EntityRow[] = [];
    for (const row of rows) {
      const hydrated = { ...row };
      for (const [name, enabled] of selected) {
        const relation = definitions[name];
        if (enabled === false || !relation) continue;
        let matches: EntityRow[] = [];
        if (relation.fields.length && relation.references.length) {
          const targets = await load(relation.targetEntity);
          matches = targets.filter((target) =>
            relation.fields.every(
              (field, index) => row[field] === target[relation.references[index]],
            ),
          );
        }
        if (relation.kind === 'one') matches = matches.slice(0, 1);
        if (typeof enabled === 'object') {
          matches = await this.hydrate(matches, relation.targetEntity, enabled, load);
        }
        hydrated[name] = relation.kind === 'one' ? (matches[0] ?? null) : matches;
      }
      results.push(hydrated);
    }
    return results;
  }
}

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  const a = typeof left === 'string' || typeof left === 'object' ? String(left) : Number(left);
  const b = typeof right === 'string' || typeof right === 'object' ? String(right) : Number(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
