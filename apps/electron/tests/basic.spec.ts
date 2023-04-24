import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';

const istanbulTempDir = process.env.ISTANBUL_TEMP_DIR
  ? path.resolve(process.env.ISTANBUL_TEMP_DIR)
  : path.join(process.cwd(), '.nyc_output');
const enableCoverage = !!process.env.CI || !!process.env.COVERAGE;
let electronApp: ElectronApplication;

function generateUUID() {
  return crypto.randomUUID();
}

beforeAll(async () => {
  electronApp = await electron.launch({
    args: [fileURLToPath(new URL('..', import.meta.url))],
    executablePath: fileURLToPath(
      new URL('../node_modules/.bin/electron', import.meta.url)
    ),
  });
  const context = electronApp.context();

  if (enableCoverage) {
    await context.addInitScript(() =>
      window.addEventListener('beforeunload', () =>
        // @ts-expect-error
        window.collectIstanbulCoverage(JSON.stringify(window.__coverage__))
      )
    );

    await fs.promises.mkdir(istanbulTempDir, { recursive: true });
    await context.exposeFunction(
      'collectIstanbulCoverage',
      (coverageJSON?: string) => {
        if (coverageJSON)
          fs.writeFileSync(
            path.join(
              istanbulTempDir,
              `playwright_coverage_${generateUUID()}.json`
            ),
            coverageJSON
          );
      }
    );
  }
});

afterAll(async () => {
  const context = electronApp.context();
  if (enableCoverage) {
    for (const page of context.pages()) {
      await page.evaluate(() =>
        // @ts-expect-error
        window.collectIstanbulCoverage(JSON.stringify(window.__coverage__))
      );
    }
  }
  await electronApp.close();
});

test('new page', async () => {
  const page = await electronApp.firstWindow();
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = await page.evaluate(
    // @ts-expect-error
    () => globalThis.currentWorkspace.flavour
  );
  expect(flavour).toBe('local');
}, 50_000);
