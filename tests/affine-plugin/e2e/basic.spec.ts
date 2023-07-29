import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('plugin should exist', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const packageJson = await page.evaluate(
    // @ts-expect-error
    () => window.__pluginPackageJson__,
    []
  );
  expect(packageJson).toEqual([
    {
      name: '@affine/bookmark-plugin',
      affinePlugin: expect.anything(),
    },
    {
      name: '@affine/copilot-plugin',
      affinePlugin: expect.anything(),
    },
    {
      name: '@affine/hello-world-plugin',
      affinePlugin: expect.anything(),
    },
  ]);
});
