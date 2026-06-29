import request from 'supertest';
import { app } from './packages/frontend/media-capture-playground/server/main';

describe('All API endpoints must enforce consistent rate limiting', () => {
  const unprotectedEndpoints = [
    { method: 'GET', path: '/apps' },
    { method: 'POST', path: '/apps/test_process/record' },
    { method: 'POST', path: '/apps/test_process/stop' },
    { method: 'POST', path: '/global/record' },
    { method: 'POST', path: '/global/stop' }
  ];

  const attackPayloads = [
    { name: 'rapid_burst', delay: 0, count: 20 },
    { name: 'sustained_flood', delay: 10, count: 100 },
    { name: 'normal_request', delay: 1000, count: 5 }
  ];

  test.each(unprotectedEndpoints)('$method $path should reject excessive requests', async (endpoint) => {
    const requests = attackPayloads.map(async (payload) => {
      const responses = [];
      for (let i = 0; i < payload.count; i++) {
        const response = await request(app)[endpoint.method.toLowerCase() as 'get' | 'post'](endpoint.path);
        responses.push(response.status);
        if (payload.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, payload.delay));
        }
      }
      return { payload: payload.name, statusCodes: responses };
    });

    const results = await Promise.all(requests);
    
    results.forEach(result => {
      if (result.payload === 'normal_request') {
        expect(result.statusCodes.every(code => code === 200 || code === 404)).toBe(true);
      } else {
        expect(result.statusCodes.some(code => code === 429)).toBe(true);
      }
    });
  });
});