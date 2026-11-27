import { describe, expect, it } from 'vitest';
import { fixtureStore } from '../../../application/testing';
import { InMemoryObjectStore } from '../../object-store/in-memory-object-store';
import {
  UnsupportedLayoutError,
  detectPulumiLayout,
  discoverPulumi,
  parseMetaVersion,
  projectFromState,
  stackNameOf,
} from './pulumi-discovery';

const summary = (projects: { name: string | null; stacks: { name: string }[] }[]) =>
  projects.map((project) => ({ name: project.name, stacks: project.stacks.map((s) => s.name) }));

describe('stack file names', () => {
  it('accepts plain, gzip and zstd files and ignores backups and retained copies', () => {
    expect(stackNameOf('prod.json')).toBe('prod');
    expect(stackNameOf('staging.json.gz')).toBe('staging');
    expect(stackNameOf('dev.json.zst')).toBe('dev');
    expect(stackNameOf('prod.json.bak')).toBeNull();
    expect(stackNameOf('prod.json.1795604215900000000')).toBeNull();
    expect(stackNameOf('notes.txt')).toBeNull();
  });

  it('reads meta.yaml and URNs', () => {
    expect(parseMetaVersion('version: 1\n')).toBe(1);
    expect(parseMetaVersion('other: 2')).toBeNull();
    expect(projectFromState('{"urn":"urn:pulumi:prod::acme-legacy::pulumi:pulumi:Stack::x"}')).toBe(
      'acme-legacy',
    );
    expect(projectFromState('{"checkpoint":{"stack":"prod"}}')).toBeNull();
  });
});

describe('discoverPulumi on real (anonymized) buckets', () => {
  it('project layout: every project and stack, ignoring .bak, retained copies and locks', async () => {
    const store = fixtureStore('project-layout');
    const discovery = await discoverPulumi(store, '.pulumi/');
    expect(discovery.layout).toBe('project');
    expect(discovery.metaVersion).toBe(1);
    expect(summary(discovery.projects)).toEqual([
      { name: 'acme-infra', stacks: ['prod', 'staging'] },
      { name: 'acme-platform', stacks: ['dev'] },
    ]);
    // staging is only gzipped
    expect(discovery.projects[0].stacks[1].key).toBe('.pulumi/stacks/acme-infra/staging.json.gz');
    // project layout never reads the states: only listings and meta.yaml
    expect(store.calls.filter((call) => call.op === 'get').map((call) => call.key)).toEqual([
      '.pulumi/meta.yaml',
    ]);
    // nor lists outside stacks/
    expect(
      store.calls
        .filter((call) => call.op === 'list')
        .every((call) => call.key.startsWith('.pulumi/stacks/')),
    ).toBe(true);
  });

  it('works under a prefix of the bucket', async () => {
    const discovery = await discoverPulumi(
      fixtureStore('project-layout', 'infra/state'),
      'infra/state/.pulumi/',
    );
    expect(summary(discovery.projects).map((p) => p.name)).toEqual(['acme-infra', 'acme-platform']);
  });

  it('legacy layout: the project comes from the URNs', async () => {
    const discovery = await discoverPulumi(fixtureStore('legacy-layout'), '.pulumi/');
    expect(discovery.layout).toBe('legacy');
    expect(discovery.metaVersion).toBeNull();
    expect(summary(discovery.projects)).toEqual([{ name: 'acme-legacy', stacks: ['prod'] }]);
  });

  it('a legacy stack without resources has an unknown project', async () => {
    const store = fixtureStore('legacy-layout');
    store.put(
      '.pulumi/stacks/empty.json',
      '{"version":3,"checkpoint":{"stack":"empty","latest":{}}}',
    );
    const discovery = await discoverPulumi(store, '.pulumi/');
    expect(summary(discovery.projects)).toEqual([
      { name: 'acme-legacy', stacks: ['prod'] },
      { name: null, stacks: ['empty'] },
    ]);
  });

  it('an empty bucket has no layout yet', async () => {
    const discovery = await discoverPulumi(new InMemoryObjectStore(), '.pulumi/');
    expect(discovery).toEqual({
      layout: 'empty',
      metaVersion: null,
      projects: [],
      truncated: false,
    });
  });

  it('refuses an unknown meta.yaml version instead of guessing', async () => {
    const store = new InMemoryObjectStore();
    store.put('.pulumi/meta.yaml', 'version: 2\n');
    await expect(detectPulumiLayout(store, '.pulumi/')).rejects.toBeInstanceOf(
      UnsupportedLayoutError,
    );
  });

  it('keeps the most recently modified variant when .json and .json.gz coexist', async () => {
    const store = new InMemoryObjectStore();
    store.put('.pulumi/meta.yaml', 'version: 1\n');
    store.put('.pulumi/stacks/p/dev.json', '{}', '2026-01-01T00:00:00Z');
    store.put('.pulumi/stacks/p/dev.json.gz', '{}', '2026-02-01T00:00:00Z');
    const discovery = await discoverPulumi(store, '.pulumi/');
    expect(discovery.projects[0].stacks).toEqual([
      expect.objectContaining({ name: 'dev', key: '.pulumi/stacks/p/dev.json.gz' }),
    ]);
  });
});
