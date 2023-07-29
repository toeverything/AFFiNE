import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('plugin should exist', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.route('**/plugins/**/package.json', route => route.fetch(), {
    times: 4,
  });
  await page.waitForTimeout(50);
  const packageJson = await page.evaluate(() => {
    // @ts-expect-error
    return window.__pluginPackageJson__;
  });
  expect(packageJson).toEqual([
    {
      name: '@affine/bookmark-plugin',
      version: expect.any(String),
      description: expect.any(String),
      affinePlugin: expect.anything(),
    },
    {
      name: '@affine/copilot-plugin',
      version: expect.any(String),
      description: expect.any(String),
      affinePlugin: expect.anything(),
    },
    {
      name: '@affine/hello-world-plugin',
      version: expect.any(String),
      description: expect.any(String),
      affinePlugin: expect.anything(),
    },
    {
      name: '@affine/image-preview-plugin',
      version: expect.any(String),
      description: expect.any(String),
      affinePlugin: expect.anything(),
    },
  ]);
});
