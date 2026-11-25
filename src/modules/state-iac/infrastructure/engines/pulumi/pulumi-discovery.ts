import { listAll, readText, type ObjectStore } from '../../object-store/object-store';

/**
 * Basic discovery of a Pulumi DIY backend: its layout and the projects and stacks it holds, so
 * they can be assigned to GitOps projects. Reading states is the engine's job (phase 2).
 * Layout reference: docs/adr/0003-state-iac.md.
 */

export type PulumiLayout = 'project' | 'legacy' | 'empty';

export type DiscoveredStack = { name: string; key: string; size: number; updatedAt: string | null };

export type DiscoveredProject = {
  /** `null` for legacy stacks whose project can't be found (no resources yet). */
  name: string | null;
  stacks: DiscoveredStack[];
};

export type PulumiDiscovery = {
  layout: PulumiLayout;
  /** `version` of `meta.yaml`; `null` when there is none. */
  metaVersion: number | null;
  projects: DiscoveredProject[];
  /** More stacks than the discovery reads at once. */
  truncated: boolean;
};

export class UnsupportedLayoutError extends Error {
  constructor(readonly version: number) {
    super(`Pulumi meta.yaml version ${version} is not supported`);
    this.name = 'UnsupportedLayoutError';
  }
}

const META_MAX_BYTES = 64 * 1024;
const MAX_STACKS = 2_000;
const LEGACY_READ_CONCURRENCY = 4;

/** `prod.json`, `prod.json.gz`, `prod.json.zst` → `prod`; `.bak` and retained copies → `null`. */
export function stackNameOf(fileName: string): string | null {
  return fileName.match(/^(.+)\.json(?:\.gz|\.zst)?$/)?.[1] ?? null;
}

/** `version: 1` → 1; `null` when the file has no version. */
export function parseMetaVersion(text: string): number | null {
  const match = text.match(/^\s*version\s*:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

/** Project of a legacy stack, from its URNs: `urn:pulumi:<stack>::<project>::…`. */
export function projectFromState(text: string): string | null {
  return text.match(/"urn:pulumi:[^:"]+::([^:"]+)::/)?.[1] ?? null;
}

/** `root` is the bookkeeping prefix, `.pulumi/` or `<prefix>/.pulumi/`. */
export async function detectPulumiLayout(
  store: ObjectStore,
  root: string,
): Promise<{ layout: PulumiLayout; metaVersion: number | null }> {
  const meta = await readText(store, `${root}meta.yaml`, META_MAX_BYTES);
  if (meta !== null) {
    const version = parseMetaVersion(meta);
    if (version === 1) return { layout: 'project', metaVersion: 1 };
    if (version === 0) return { layout: 'legacy', metaVersion: 0 };
    throw new UnsupportedLayoutError(version ?? -1);
  }
  // Pulumi only writes meta.yaml for the project layout: without it, look at stacks/
  const page = await store.list(`${root}stacks/`, { delimiter: '/', maxKeys: 100 });
  const legacyStacks = page.objects.some((object) =>
    stackNameOf(object.key.slice(`${root}stacks/`.length)),
  );
  if (legacyStacks) return { layout: 'legacy', metaVersion: null };
  if (page.prefixes.length > 0) return { layout: 'project', metaVersion: null };
  return { layout: 'empty', metaVersion: null };
}

function stacksIn(objects: { key: string; size: number; updatedAt: string | null }[], dir: string) {
  const byName = new Map<string, DiscoveredStack>();
  for (const object of objects) {
    const name = stackNameOf(object.key.slice(dir.length));
    if (!name) continue;
    const current = byName.get(name);
    // `x.json` and `x.json.gz` at once: the most recently modified wins, like Pulumi does
    if (!current || (object.updatedAt ?? '') >= (current.updatedAt ?? '')) {
      byName.set(name, { name, key: object.key, size: object.size, updatedAt: object.updatedAt });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverPulumi(store: ObjectStore, root: string): Promise<PulumiDiscovery> {
  const { layout, metaVersion } = await detectPulumiLayout(store, root);
  const stacksDir = `${root}stacks/`;
  if (layout === 'empty') return { layout, metaVersion, projects: [], truncated: false };

  if (layout === 'project') {
    const { prefixes } = await listAll(store, stacksDir, { delimiter: '/' });
    const projects: DiscoveredProject[] = [];
    let count = 0;
    let truncated = false;
    for (const projectDir of prefixes.sort()) {
      const name = projectDir.slice(stacksDir.length, -1);
      const listed = await listAll(store, projectDir, {
        delimiter: '/',
        maxObjects: MAX_STACKS - count,
      });
      const stacks = stacksIn(listed.objects, projectDir);
      count += stacks.length;
      truncated ||= listed.truncated;
      if (stacks.length > 0) projects.push({ name, stacks });
      if (count >= MAX_STACKS) {
        truncated = true;
        break;
      }
    }
    return { layout, metaVersion, projects, truncated };
  }

  // legacy: one flat folder; the project is only in each state's URNs
  const listed = await listAll(store, stacksDir, { delimiter: '/', maxObjects: MAX_STACKS });
  const stacks = stacksIn(listed.objects, stacksDir);
  const projectOf = new Map<string, string | null>();
  for (let i = 0; i < stacks.length; i += LEGACY_READ_CONCURRENCY) {
    await Promise.all(
      stacks.slice(i, i + LEGACY_READ_CONCURRENCY).map(async (stack) => {
        const text = await readText(store, stack.key);
        projectOf.set(stack.name, text ? projectFromState(text) : null);
      }),
    );
  }
  const grouped = new Map<string | null, DiscoveredStack[]>();
  for (const stack of stacks) {
    const project = projectOf.get(stack.name) ?? null;
    grouped.set(project, [...(grouped.get(project) ?? []), stack]);
  }
  const projects = [...grouped.entries()]
    .map(([name, list]) => ({ name, stacks: list }))
    // unknown project last
    .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)));
  return { layout, metaVersion, projects, truncated: listed.truncated };
}
