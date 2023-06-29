import { resolve } from 'node:path';

import { test } from '@playwright/test';
import express from 'express';

let app: express.Express;
let server: ReturnType<express.Express['listen']>;

test.beforeEach(() => {
  app = express();
  app.use(express.static(resolve(__dirname, '..', 'static')));
  server = app.listen(8081);
});

test.afterEach(() => {
  server.close();
});

test('init page', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });

  const currentWorkspaceId: string = await page.evaluate(
    () => (globalThis as any).currentWorkspace.id
  );

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const workspace = (globalThis as any).currentWorkspace.blockSuiteWorkspace;
    workspace.exportYDoc();
  });

  const download = await downloadPromise;
  const output = resolve(__dirname, 'fixtures', currentWorkspaceId + '.ydoc');
  await download.saveAs(output);
});
