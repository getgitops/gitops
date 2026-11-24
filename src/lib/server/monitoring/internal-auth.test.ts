import { describe, expect, it } from 'vitest';
import { verifyWorkerRequest } from './internal-auth';

const request = (headers: Record<string, string>) =>
  new Request('http://gitops.local/api/internal/monitoring/lease', { method: 'POST', headers });

describe('verifyWorkerRequest', () => {
  it('hides the API when no token is configured', () => {
    expect(
      verifyWorkerRequest(request({ authorization: 'Bearer x' }), {
        workerToken: null,
        internalHosts: [],
      })?.status,
    ).toBe(404);
  });

  it('requires the exact token', () => {
    const config = { workerToken: 'secret-token', internalHosts: [] };
    expect(verifyWorkerRequest(request({}), config)?.status).toBe(401);
    expect(verifyWorkerRequest(request({ authorization: 'Bearer wrong' }), config)?.status).toBe(
      401,
    );
    expect(
      verifyWorkerRequest(request({ authorization: 'Bearer secret-token' }), config),
    ).toBeNull();
  });

  it('only answers on the allowed private hosts', () => {
    const config = { workerToken: 't', internalHosts: ['gitops.railway.internal:3000'] };
    expect(
      verifyWorkerRequest(
        request({ authorization: 'Bearer t', host: 'gitops.example.com' }),
        config,
      )?.status,
    ).toBe(404);
    expect(
      verifyWorkerRequest(
        request({ authorization: 'Bearer t', host: 'gitops.railway.internal:3000' }),
        config,
      ),
    ).toBeNull();
  });
});
