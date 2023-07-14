import { ok } from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path, { resolve } from 'node:path';
import process from 'node:process';

import type { Workspace } from '@blocksuite/store';
import { test as baseTest } from '@playwright/test';

export const rootDir = resolve(__dirname, '..', '..');
// assert that the rootDir is the root of the project
ok(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require(resolve(rootDir, 'package.json')).name.toLowerCase() ===
    '@affine/monorepo'
);

export const testResultDir = resolve(rootDir, 'test-results');

export const istanbulTempDir = process.env.ISTANBUL_TEMP_DIR
  ? path.resolve(process.env.ISTANBUL_TEMP_DIR)
  : path.join(rootDir, '.nyc_output');

function generateUUID() {
  return crypto.randomUUID();
}

export const enableCoverage = !!process.env.CI || !!process.env.COVERAGE;

type CurrentWorkspace = {
  id: string;
  flavour: string;
  blockSuiteWorkspace: Workspace;
};

export const test = baseTest.extend<{
  workspace: {
    current: () => Promise<CurrentWorkspace>;
  };
}>({
  workspace: async ({ page }, use) => {
    await use({
      current: async () => {
        return await page.evaluate(async () => {
          return (globalThis as any).currentWorkspace;
        });
      },
    });
  },
  context: async ({ context }, use) => {
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

    await use(context);

    if (enableCoverage) {
      for (const page of context.pages()) {
        await page.evaluate(() =>
          // @ts-expect-error
          window.collectIstanbulCoverage(JSON.stringify(window.__coverage__))
        );
      }
    }
  },
});
