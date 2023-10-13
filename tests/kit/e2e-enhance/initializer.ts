import { dirname, join } from 'node:path';

import type { Page } from '@playwright/test';

declare global {
  function readAffineDatabase(): Promise<any>;
  function writeAffineDatabase(data: any, binaries: any): Promise<void>;
  function readAffineLocalStorage(): Promise<any>;
  function writeAffineLocalStorage(data: any): Promise<void>;
}

export async function patchDataEnhancement(page: Page) {
  const idbPath = join(dirname(require.resolve('idb')), 'umd.js');
  await page.addInitScript({ path: idbPath });

  const patchPath = join(__dirname, './storage-patch.js');
  await page.addInitScript({ path: patchPath });
}
