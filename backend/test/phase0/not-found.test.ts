import { describe, expect, it } from 'vitest';

import { startTestApp } from '../helpers/app.js';

describe('Phase 0 — unknown routes', () => {
  it('returns JSON 404 without leaking internals', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/definitely-not-a-route',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: 'not_found',
    });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
