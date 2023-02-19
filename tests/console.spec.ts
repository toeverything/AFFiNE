import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';

const pkgPath = path.join(__dirname, '../apps/web/package.json');
const record = fs.readFileSync(pkgPath, 'utf8');
const temp = JSON.parse(record);
loadPage();

declare global {
  interface Window {
    __editoVersion: unknown;
  }
}

test.describe('web console', () => {
  test('editor version', async ({ page }) => {
    const pkgEditorVersion = temp.dependencies['@blocksuite/editor'];
    const editoVersion = await page.evaluate(() => window.__editoVersion);
    expect(editoVersion).toBe(pkgEditorVersion);
  });
});
