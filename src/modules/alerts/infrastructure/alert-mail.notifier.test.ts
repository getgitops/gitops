import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventDefinition, type EventDefinition } from '#lib/events/catalog';
import { registerTransport, resetTransports } from '#lib/server/infra/notifications';
import type { AnyDomainEvent } from '#lib/server/events';
import { AlertMailNotifier } from './alert-mail.notifier';

const send = vi.fn(
  async (notification: { to: string[]; subject: string; content: string }) => notification,
);

const event: AnyDomainEvent = {
  id: 'event-1',
  type: 'code_report.analysis.completed',
  occurredAt: '2026-11-20T10:00:00.000Z',
  actor: { kind: 'system' },
  scope: { organizationId: 'org-1', projectId: 'p1' },
  payload: {
    analysisId: 'analysis-1',
    serviceId: 'svc-gateway',
    tool: 'trivy',
    gitInfo: { repositoryUrl: null, branch: '<main>', commit: null, version: null },
    summary: { critical: 2, high: 0, medium: 0, low: 0, unknown: 0, total: 2, secrets: 0 },
    policies: { status: 'compliant', totalViolations: 0, blockingFailures: 0, failedPolicyIds: [] },
  },
};

describe('AlertMailNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransports();
    registerTransport('mail', { send } as never);
  });

  afterEach(() => resetTransports());

  it('sends one email to the recipient with the event fields', async () => {
    await new AlertMailNotifier('es').sendAlert({
      recipient: { userId: 'u1', username: 'ana', email: 'ana@example.com' },
      alert: { id: 'a1', name: 'Críticas en api-gateway', description: null },
      event,
      definition: getEventDefinition('code_report.analysis.completed') as EventDefinition,
      suppressed: 3,
      names: new Map([['svc-gateway', 'api-gateway']]),
    });

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['ana@example.com']);
    expect(mail.subject).toBe('[GitOps] Críticas en api-gateway: Análisis completado');
    expect(mail.content).toContain('api-gateway');
    expect(mail.content).toContain('Trivy');
    // payload values are escaped
    expect(mail.content).toContain('&lt;main&gt;');
    expect(mail.content).toContain('3 eventos');
    expect(mail.content).not.toContain('{{');
  });

  it('renders system notifications in English too', async () => {
    await new AlertMailNotifier('en').sendSystemNotification({
      recipient: { userId: 'u1', username: 'ana', email: 'ana@example.com' },
      kind: 'access_granted',
      event: { ...event, type: 'access.granted' } as unknown as AnyDomainEvent,
      names: { organization: 'Kettu', project: 'Web', role: 'Developer' },
    });

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('You now have access to the project Web (Kettu)');
    expect(mail.content).toContain('with the role Developer');
  });
});
