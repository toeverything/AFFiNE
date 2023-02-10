import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.join(__dirname, '../apps/web/package.json');
const record = fs.readFileSync(pkgPath, 'utf8');
const temp = JSON.parse(record);
loadPage();
test.describe('web console', () => {
  test('editor version', async ({ page }) => {
    const pkgEditorVersion = temp.dependencies['@blocksuite/editor'];
    const editoVersion = await page.evaluate(() => window.__editoVersion);
    expect(editoVersion).toBe(pkgEditorVersion);
  });
});
