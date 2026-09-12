import { describe, expect, it } from 'vitest';

import { startTestApp } from '../helpers/app.js';

describe('Phase 0 — GET /info', () => {
  it('returns 200 JSON the compose healthcheck and clients can probe', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({ method: 'GET', url: '/info' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    const body = res.json();
    expect(body).toMatchObject({
      name: 'Mosaic',
      version: '0.1.0',
      compatibility: '0.27.5',
      message: 'Mosaic Server',
      flavor: 'allinone',
      type: 'selfhosted',
      features: [],
    });
  });

  it('advertises a compatibility version the MIT client accepts (>= 0.27.0)', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({ method: 'GET', url: '/info' });
    const { compatibility } = res.json() as { compatibility: string };
    expect(compatibility).toMatch(/^\d+\.\d+\.\d+/);
    const [major, minor] = compatibility.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(0);
    expect((major ?? 0) > 0 || (minor ?? 0) >= 27).toBe(true);
  });

  it('echoes x-request-id and x-trace-id for log correlation', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/info',
      headers: { 'x-request-id': 'req-phase0', 'x-trace-id': 'trace-phase0' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('req-phase0');
    expect(res.headers['x-trace-id']).toBe('trace-phase0');
  });

  it('derives trace id from W3C traceparent when no x-trace-id is sent', async () => {
    const { app } = await startTestApp();
    const traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const res = await app.inject({
      method: 'GET',
      url: '/info',
      headers: {
        traceparent: `00-${traceId}-bbbbbbbbbbbbbbbb-01`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-trace-id']).toBe(traceId);
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('Phase 0 — health and metrics', () => {
  it('GET /health/live reports process liveness', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      checks: { process: 'up' },
    });
  });

  it('GET /health/ready is ok without postgres/redis in Phase 0', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      checks: Record<string, string>;
    };
    expect(body.status).toBe('ok');
    expect(body.checks.postgres).toBe('skipped');
    expect(body.checks.redis).toBe('skipped');
  });

  it('GET /metrics exposes Prometheus text with HTTP and sync placeholders', async () => {
    const { app } = await startTestApp();
    await app.inject({ method: 'GET', url: '/info' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    const text = res.body;
    expect(text).toContain('mosaic_http_requests_total');
    expect(text).toContain('mosaic_sync_lag_ms');
    expect(text).toContain('mosaic_update_size_bytes');
    expect(text).toContain('mosaic_error_rate');
  });
});
