import type Test from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { waitForEditorLoad } from './page-logic';

export async function check8080Available(context: BrowserContext) {
  // make sure 8080 is ready
  const page = await context.newPage();
  await page.goto('http://localhost:8080/');
  await waitForEditorLoad(page);
  await page.close();
}

export function setupProxyServer(test: typeof Test, dir: string) {
  let app: express.Express;
  let server: ReturnType<express.Express['listen']>;
  test.beforeEach(() => {
    app = express();
    app.use(express.static(dir));
    server = app.listen(8081);
  });

  test.afterEach(() => {
    server.close();
  });

  return {
    get app() {
      return app;
    },
    get server() {
      return server;
    },
    switchToNext: async function () {
      // close previous express server
      await new Promise<void>((resolve, reject) => {
        server.close(err => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
      app = express();
      app.use(
        createProxyMiddleware({
          target: 'http://localhost:8080',
          pathFilter: ['**'],
          changeOrigin: true,
        })
      );
      return new Promise<void>(resolve => {
        server = app.listen(8081, () => {
          console.log('proxy to next.js server');
          resolve();
        });
      });
    },
  };
}
