import { beforeEach, describe, expect, it } from 'vitest';
import { StateIacValidationError, type StateBackendDomain } from '../domain/state-backend.domain';
import { createStateIacFixture } from './testing';

describe('StateBindingService', () => {
  let fx: ReturnType<typeof createStateIacFixture>;
  let backend: StateBackendDomain;

  beforeEach(async () => {
    fx = createStateIacFixture();
    backend = await fx.backendService.create('org-1', {
      name: 'gcs-prod',
      provider: 'gcs',
      bucket: 'acme-pulumi-state',
    });
  });

  async function errorsOf(promise: Promise<unknown>) {
    const error = await promise.then(
      () => null,
      (e) => e,
    );
    expect(error).toBeInstanceOf(StateIacValidationError);
    return (error as StateIacValidationError).errors;
  }

  it('assigns a Pulumi project to a project of the same organization', async () => {
    const binding = await fx.bindingService.set(backend, 'network', { projectId: 'p1' });
    expect(binding.toJson()).toMatchObject({
      organizationId: 'org-1',
      backendId: backend.id,
      pulumiProject: 'network',
      projectId: 'p1',
      stacks: [],
    });
    expect(binding.covers('prod')).toBe(true);
    expect(fx.events.ofType('state_iac.binding.updated').map((e) => e.payload)).toEqual([
      {
        backendId: backend.id,
        backendName: 'gcs-prod',
        pulumiProject: 'network',
        projectId: 'p1',
        previousProjectId: null,
        stacks: [],
      },
    ]);
  });

  it('a Pulumi project has one assignment: setting it again reassigns', async () => {
    await fx.bindingService.set(backend, 'network', { projectId: 'p1' });
    await fx.bindingService.set(backend, 'network', {
      projectId: 'p2',
      stacks: ['prod', 'dev', 'prod'],
    });
    expect(fx.bindings.rows).toHaveLength(1);
    expect(fx.bindings.rows[0]).toMatchObject({ projectId: 'p2', stacks: ['dev', 'prod'] });
    const last = fx.events.ofType('state_iac.binding.updated').at(-1)!.payload;
    expect(last).toMatchObject({ projectId: 'p2', previousProjectId: 'p1' });

    // same assignment again: no write, no event
    await fx.bindingService.set(backend, 'network', { projectId: 'p2', stacks: ['prod', 'dev'] });
    expect(fx.events.ofType('state_iac.binding.updated')).toHaveLength(2);
  });

  it('only covers the chosen stacks when given', async () => {
    const binding = await fx.bindingService.set(backend, 'network', {
      projectId: 'p1',
      stacks: 'prod, staging',
    });
    expect(binding.covers('prod')).toBe(true);
    expect(binding.covers('dev')).toBe(false);
  });

  it('refuses projects of another organization as if they did not exist', async () => {
    expect(
      await errorsOf(fx.bindingService.set(backend, 'network', { projectId: 'other-org-project' })),
    ).toEqual({ projectId: 'project_not_found' });
    expect(
      await errorsOf(fx.bindingService.set(backend, 'network', { projectId: 'nope' })),
    ).toEqual({ projectId: 'project_not_found' });
    expect(fx.bindings.rows).toHaveLength(0);
  });

  it('validates names', async () => {
    expect(
      await errorsOf(fx.bindingService.set(backend, 'bad name/..', { stacks: ['ok', 'no way'] })),
    ).toEqual({
      pulumiProject: 'invalid_pulumi_name',
      stacks: 'invalid_stacks',
      projectId: 'required',
    });
  });

  it('unassigns', async () => {
    await fx.bindingService.set(backend, 'network', { projectId: 'p1' });
    expect(await fx.bindingService.remove(backend, 'network')).toBe(true);
    expect(await fx.bindingService.remove(backend, 'network')).toBe(false);
    expect(fx.bindings.rows).toHaveLength(0);
    expect(fx.events.ofType('state_iac.binding.updated').at(-1)!.payload).toMatchObject({
      projectId: null,
      previousProjectId: 'p1',
    });
  });

  it('a deleted GitOps project takes its assignments with it', async () => {
    await fx.bindingService.set(backend, 'network', { projectId: 'p1' });
    await fx.bindingService.set(backend, 'sandbox', { projectId: 'p1' });
    await fx.bindingService.set(backend, 'payments', { projectId: 'p2' });
    expect(await fx.bindingService.removeForProject('p1')).toBe(2);
    expect(fx.bindings.rows.map((row) => row.pulumiProject)).toEqual(['payments']);
  });
});
