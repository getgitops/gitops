import {
  isSpecialValue,
  type IacResource,
  type IacSnapshot,
  type IacValue,
} from '../domain/iac.model';

/**
 * Compares two snapshots of a stack (docs/adr/0003-state-iac.md, "Diff normalization"):
 * - resources are matched by address; same address with another cloud id is a `replace`;
 * - dependencies compare as sets and the provider without its id (both already normalized);
 * - secrets are never revealed: two secrets compare equal (Pulumi re-encrypts them on every
 *   write, so a different ciphertext means nothing), and a field that is or was secret says so;
 * - a resource whose only change is its provider (a provider upgrade touches every resource) is
 *   flagged `providerOnly`, so it can be shown as one change instead of N updates.
 */

export type IacFieldChange = {
  /** `inputs.settings.tier`, `outputs.ipAddresses[0]`, `dependencies`, `provider`… */
  path: string;
  before?: IacValue;
  after?: IacValue;
  /** The value is, or was, a secret: neither side is shown in clear. */
  secret: boolean;
};

export type IacResourceChange = {
  address: string;
  type: string;
  name: string;
  change: 'create' | 'delete' | 'update' | 'replace';
  providerOnly: boolean;
  fields: IacFieldChange[];
};

export type IacDiffSummary = {
  create: number;
  delete: number;
  update: number;
  replace: number;
  same: number;
  /** Updates whose only change is the provider (included in `update`). */
  providerOnly: number;
};

export type IacDiff = {
  from: { sourceId: string | null; takenAt: string | null };
  to: { sourceId: string | null; takenAt: string | null };
  summary: IacDiffSummary;
  resources: IacResourceChange[];
  /** Changes of the stack outputs. */
  outputs: IacFieldChange[];
};

const MAX_DEPTH = 8;
const MAX_FIELDS = 200;
const ORDER = { replace: 0, create: 1, delete: 2, update: 3 } as const;

const isSecret = (value: IacValue | undefined) =>
  isSpecialValue(value) && (value as { $iac: string }).$iac === 'secret';

/** Deep equality where every secret equals every secret. */
export function sameValue(a: IacValue | undefined, b: IacValue | undefined): boolean {
  if (isSecret(a) && isSecret(b)) return true;
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, IacValue>;
  const right = b as Record<string, IacValue>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!sameValue(left[key], right[key])) return false;
  return true;
}

const isPlainObject = (value: IacValue | undefined): value is Record<string, IacValue> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !isSpecialValue(value);

/** Field-level differences between two values, down to the leaves. */
function diffValues(
  path: string,
  before: IacValue | undefined,
  after: IacValue | undefined,
  out: IacFieldChange[],
  depth = 0,
) {
  if (out.length >= MAX_FIELDS || sameValue(before, after)) return;
  if (depth < MAX_DEPTH && isPlainObject(before) && isPlainObject(after)) {
    const left = before as Record<string, IacValue>;
    const right = after as Record<string, IacValue>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) diffValues(`${path}.${key}`, left[key], right[key], out, depth + 1);
    return;
  }
  if (
    depth < MAX_DEPTH &&
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length
  ) {
    before.forEach((item, i) => diffValues(`${path}[${i}]`, item, after[i], out, depth + 1));
    return;
  }
  const secret = isSecret(before) || isSecret(after);
  out.push({
    path,
    ...(before !== undefined ? { before: isSecret(before) ? { $iac: 'secret' } : before } : {}),
    ...(after !== undefined ? { after: isSecret(after) ? { $iac: 'secret' } : after } : {}),
    secret,
  });
}

function diffResource(before: IacResource, after: IacResource): IacFieldChange[] {
  const fields: IacFieldChange[] = [];
  for (const key of [
    ...new Set([...Object.keys(before.inputs), ...Object.keys(after.inputs)]),
  ].sort()) {
    diffValues(`inputs.${key}`, before.inputs[key], after.inputs[key], fields);
  }
  for (const key of [
    ...new Set([...Object.keys(before.outputs), ...Object.keys(after.outputs)]),
  ].sort()) {
    diffValues(`outputs.${key}`, before.outputs[key], after.outputs[key], fields);
  }
  const scalar = (path: string, a: IacValue, b: IacValue) => {
    if (!sameValue(a, b)) fields.push({ path, before: a, after: b, secret: false });
  };
  scalar('externalId', before.externalId, after.externalId);
  scalar('parent', before.parent, after.parent);
  scalar('provider', before.provider, after.provider);
  // dependencies are sets (Pulumi reorders them between writes)
  const removed = before.dependencies.filter((d) => !after.dependencies.includes(d));
  const added = after.dependencies.filter((d) => !before.dependencies.includes(d));
  if (removed.length > 0 || added.length > 0) {
    fields.push({ path: 'dependencies', before: removed, after: added, secret: false });
  }
  for (const flag of Object.keys(before.flags) as (keyof IacResource['flags'])[]) {
    scalar(`flags.${flag}`, before.flags[flag], after.flags[flag]);
  }
  return fields.slice(0, MAX_FIELDS);
}

export function diffSnapshots(from: IacSnapshot, to: IacSnapshot): IacDiff {
  const before = new Map(from.resources.map((r) => [r.address, r]));
  const after = new Map(to.resources.map((r) => [r.address, r]));
  const resources: IacResourceChange[] = [];
  const summary: IacDiffSummary = {
    create: 0,
    delete: 0,
    update: 0,
    replace: 0,
    same: 0,
    providerOnly: 0,
  };
  const entry = (
    r: IacResource,
    change: IacResourceChange['change'],
    fields: IacFieldChange[] = [],
  ) => ({
    address: r.address,
    type: r.type,
    name: r.name,
    change,
    providerOnly: false,
    fields,
  });

  for (const [address, next] of after) {
    const previous = before.get(address);
    if (!previous) {
      summary.create++;
      resources.push(entry(next, 'create'));
      continue;
    }
    const fields = diffResource(previous, next);
    if (fields.length === 0) {
      summary.same++;
      continue;
    }
    const replaced =
      previous.externalId !== null &&
      next.externalId !== null &&
      previous.externalId !== next.externalId;
    if (replaced) {
      summary.replace++;
      resources.push(entry(next, 'replace', fields));
      continue;
    }
    summary.update++;
    const change = entry(next, 'update', fields);
    change.providerOnly = fields.every((field) => field.path === 'provider');
    if (change.providerOnly) summary.providerOnly++;
    resources.push(change);
  }
  for (const [address, previous] of before) {
    if (after.has(address)) continue;
    summary.delete++;
    resources.push(entry(previous, 'delete'));
  }
  resources.sort((a, b) => ORDER[a.change] - ORDER[b.change] || a.address.localeCompare(b.address));

  const outputs: IacFieldChange[] = [];
  for (const key of [
    ...new Set([...Object.keys(from.outputs), ...Object.keys(to.outputs)]),
  ].sort()) {
    diffValues(key, from.outputs[key], to.outputs[key], outputs);
  }

  return {
    from: { sourceId: from.versionId, takenAt: from.takenAt },
    to: { sourceId: to.versionId, takenAt: to.takenAt },
    summary,
    resources,
    outputs,
  };
}
