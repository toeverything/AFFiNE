// src/mocks.js
// 1. Import the library.
import { rest, setupWorker } from 'msw';

// 2. Describe network behavior with request handlers.
export const worker = setupWorker(
  rest.get('https://github.com/octocat', (req, res, ctx) => {
    return res(
      ctx.delay(1500),
      ctx.status(202, 'Mocked status'),
      ctx.json({
        message: 'Mocked response JSON body',
      })
    );
  }),
  rest.get('/api/test', (req, res, ctx) => {
    return res(
      ctx.delay(1500),
      ctx.status(202, 'Mocked status'),
      ctx.json({
        message: 'Mocked response JSON body22',
      })
    );
  })
);
