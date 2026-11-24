import { describe, expect, it, vi } from 'vitest';
import type { MonitorSecrets } from '../domain/monitor.domain';
import { MonitorNotFoundError, MonitorService, MonitorValidationError } from './monitor.service';
import { InMemoryMonitorStore } from './testing';

function setup() {
  const store = new InMemoryMonitorStore();
  const vault = new Map<string, MonitorSecrets>();
  const runCheck = vi.fn(async () => ({
    outcome: {
      status: 'up' as const,
      cause: null,
      httpStatus: 200,
      latencyMs: 10,
      error: null,
      startedAt: '',
      endedAt: '',
    },
    preview: null,
  }));
  const onChanged = vi.fn();
  const onDeleted = vi.fn();
  const service = new MonitorService({
    store,
    services: {
      getProjectIdOf: async (id) =>
        id === 'service-1' ? 'project-1' : id === 'other' ? 'project-2' : null,
    },
    // fake cipher: keeps the plaintext aside and stores an opaque token
    encrypt: (id, secrets) => {
      vault.set(id, secrets);
      return `enc:${id}`;
    },
    decrypt: (id, stored) => (stored ? vault.get(id)! : { headers: {}, body: null }),
    runCheck,
    allowPrivateTargets: () => false,
    onChanged,
    onDeleted,
  });
  return { service, store, vault, runCheck, onChanged, onDeleted };
}

const valid = {
  name: 'API',
  url: 'https://api.example.com/health',
  method: 'GET',
  headers: [{ name: 'Authorization', value: 'Bearer abc' }],
};

describe('MonitorService', () => {
  it('creates a monitor with defaults, encrypted headers and no secret in its view', async () => {
    const { service, store, onChanged } = setup();
    const view = await service.create('project-1', valid);
    expect(view).toMatchObject({
      intervalSeconds: 60,
      timeoutMs: 10_000,
      expectedStatus: '200-299',
      headerNames: ['Authorization'],
      enabled: true,
    });
    expect(JSON.stringify(view)).not.toContain('Bearer abc');
    expect(store.rows[0].secrets).toBe(`enc:${view.id}`);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('returns field-level error codes', async () => {
    const { service } = setup();
    const attempt = service.create('project-1', {
      name: '',
      url: 'ftp://example.com',
      method: 'BREW',
      intervalSeconds: 5,
      expectedStatus: '2xx',
      headers: [{ name: 'Bad Header', value: 'x' }],
    });
    await expect(attempt).rejects.toBeInstanceOf(MonitorValidationError);
    const errors = await attempt.catch((err: MonitorValidationError) => err.errors);
    expect(errors).toMatchObject({
      name: 'required',
      url: 'invalid_url',
      method: 'invalid_method',
      intervalSeconds: 'out_of_range',
      expectedStatus: 'invalid_expected_status',
      'headers.0.name': 'invalid_header',
    });
  });

  it('refuses private targets and services of another project', async () => {
    const { service } = setup();
    const errors = await service
      .create('project-1', { ...valid, url: 'http://169.254.169.254/latest', serviceId: 'other' })
      .catch((err: MonitorValidationError) => err.errors);
    expect(errors).toMatchObject({ url: 'private_target', serviceId: 'service_not_found' });
  });

  it('keeps stored header values left empty on update', async () => {
    const { service, vault } = setup();
    const created = await service.create('project-1', {
      ...valid,
      method: 'POST',
      body: '{"a":1}',
    });
    await service.update('project-1', created.id, {
      headers: [
        { name: 'Authorization', value: null },
        { name: 'X-Env', value: 'prod' },
      ],
    });
    expect(vault.get(created.id)).toEqual({
      headers: { Authorization: 'Bearer abc', 'X-Env': 'prod' },
      body: '{"a":1}',
    });

    const errors = await service
      .update('project-1', created.id, { headers: [{ name: 'X-New', value: null }] })
      .catch((err: MonitorValidationError) => err.errors);
    expect(errors).toMatchObject({ 'headers.0.value': 'required' });
  });

  it('tests a draft with the stored secrets, without saving', async () => {
    const { service, store, runCheck } = setup();
    const created = await service.create('project-1', valid);
    await service.test(
      'project-1',
      { url: 'https://api.example.com/other', headers: [{ name: 'Authorization', value: null }] },
      created.id,
    );
    expect(runCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/other',
        headers: { Authorization: 'Bearer abc' },
      }),
    );
    expect(store.rows[0].url).toBe('https://api.example.com/health');
  });

  it('confines monitors to their project', async () => {
    const { service, onDeleted } = setup();
    const created = await service.create('project-1', valid);
    await expect(service.get('project-2', created.id)).rejects.toBeInstanceOf(MonitorNotFoundError);
    await expect(service.delete('project-2', created.id)).rejects.toBeInstanceOf(
      MonitorNotFoundError,
    );
    await service.delete('project-1', created.id);
    expect(onDeleted).toHaveBeenCalledWith(created.id);
  });

  it('lists the monitors of a service', async () => {
    const { service } = setup();
    await service.create('project-1', { ...valid, serviceId: 'service-1' });
    await service.create('project-1', { ...valid, name: 'Other' });
    expect((await service.listByService('project-1', 'service-1')).map((m) => m.name)).toEqual([
      'API',
    ]);
  });
});
