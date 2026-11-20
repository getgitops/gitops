import { beforeEach, describe, expect, it } from 'vitest';
import { RecordingEventBus } from '#lib/server/events/testing';
import { CodeReportServiceDomain } from '../domain/code-report-service.domain';
import { CodeReportService } from './code-report.service';

class FakeServiceRepository {
  rows: CodeReportServiceDomain[] = [];

  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findBySlug(projectId: string, slug: string) {
    return this.rows.find((row) => row.projectId === projectId && row.slug === slug) ?? null;
  }

  async create(input: Record<string, unknown>) {
    this.rows.push(new CodeReportServiceDomain(input));
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

const PROJECT = { id: 'project-1', slug: 'shop', organization: { id: 'org-1' } };

const projectService = {
  getProjectBySlug: async (slug: string) => (slug === PROJECT.slug ? PROJECT : null),
  getProject: async (id: string) => {
    if (id !== PROJECT.id) throw new Error('Project not found');
    return PROJECT;
  },
};

describe('CodeReportService events', () => {
  let repository: FakeServiceRepository;
  let events: RecordingEventBus;
  let service: CodeReportService;

  beforeEach(() => {
    repository = new FakeServiceRepository();
    events = new RecordingEventBus();
    service = new CodeReportService(
      repository as never,
      projectService as never,
      { deleteAllByService: async () => {} },
      events,
    );
  });

  it('publishes service.created with the project scope', async () => {
    const created = await service.createService({ project: 'shop', name: 'API Gateway' });

    expect(events.types()).toEqual(['code_report.service.created']);
    const [event] = events.ofType('code_report.service.created');
    expect(event.payload).toEqual({
      serviceId: created.id,
      name: 'API Gateway',
      slug: 'api-gateway',
    });
    expect(event.scope).toEqual({ organizationId: 'org-1', projectId: 'project-1' });
  });

  it('publishes service.deleted after deleting', async () => {
    const created = await service.createService({ project: 'shop', name: 'API Gateway' });
    events.clear();

    await service.deleteService(created.id);

    expect(events.ofType('code_report.service.deleted').map((event) => event.payload)).toEqual([
      { serviceId: created.id, name: 'API Gateway', slug: 'api-gateway' },
    ]);
    expect(events.ofType('code_report.service.deleted')[0].scope).toEqual({
      organizationId: 'org-1',
      projectId: 'project-1',
    });
  });

  it('publishes nothing when creation or deletion is rejected', async () => {
    await expect(service.createService({ project: 'missing', name: 'API' })).rejects.toThrow();
    await service.createService({ project: 'shop', name: 'API' });
    events.clear();
    await expect(service.createService({ project: 'shop', name: 'API' })).rejects.toThrow(
      /already exists/,
    );
    await expect(service.deleteService('missing')).rejects.toThrow();

    expect(events.events).toEqual([]);
  });
});
