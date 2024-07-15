import { ok } from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path, { resolve } from 'node:path';
import process from 'node:process';

import type { BrowserContext } from '@playwright/test';
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

type CurrentDocCollection = {
  meta: { id: string; flavour: string };
};

export const skipOnboarding = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('app_config', '{"onBoarding":false}');
    window.localStorage.setItem('dismissAiOnboarding', 'true');
    window.localStorage.setItem('dismissAiOnboardingEdgeless', 'true');
    window.localStorage.setItem('dismissAiOnboardingLocal', 'true');
  });
};

export const test = baseTest.extend<{
  workspace: {
    current: () => Promise<CurrentDocCollection>;
  };
}>({
  workspace: async ({ page }, use) => {
    await use({
      current: async () => {
        return await page.evaluate(async () => {
          if (!(globalThis as any).currentWorkspace) {
            await new Promise<void>((resolve, reject) => {
              globalThis.addEventListener(
                'affine:workspace:change',
                () => resolve(),
                {
                  once: true,
                }
              );
              setTimeout(() => reject(new Error('timeout')), 5000);
            });
          }
          const currentWorkspace = (globalThis as any).currentWorkspace;
          return {
            meta: currentWorkspace.meta,
          };
        });
      },
    });
  },
  page: async ({ page, context }, use) => {
    if (process.env.CPU_THROTTLE) {
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send('Emulation.setCPUThrottlingRate', {
        rate: parseInt(process.env.CPU_THROTTLE),
      });
    }
    await use(page);
  },
  context: async ({ context }, use) => {
    // workaround for skipping onboarding redirect on the web
    await skipOnboarding(context);

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
