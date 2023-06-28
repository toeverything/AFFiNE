import { resolve } from 'node:path';

import { test } from '@playwright/test';

test('init page', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });

  const currentWorkspaceId: string = await page.evaluate(
    () => (globalThis.currentWorkspace as any).id
  );

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const workspace = (globalThis.currentWorkspace as any).blockSuiteWorkspace;
    workspace.exportYDoc();
  });

  const download = await downloadPromise;
  const output = resolve(__dirname, 'fixtures', currentWorkspaceId + '.ydoc');
  await download.saveAs(output);
});
