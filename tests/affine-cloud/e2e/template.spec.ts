import { test } from '@affine-test/kit/playwright';
import { createRandomUser, loginUser } from '@affine-test/kit/utils/cloud';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';

test.beforeEach(async ({ page }) => {
  const user = await createRandomUser();
  await loginUser(page, user);
});

test('import from template should work', async ({ page }) => {
  await page.goto('https://affine.pro/templates', { waitUntil: 'load' });

  await page.click('.template-list > a:first-child');
  const importLink = page.getByText('Use this template');

  const href = await importLink.evaluate((el: HTMLElement) => {
    const a = el.closest('a');
    if (!a) {
      throw new Error('Import link not found');
    }
    return a.href;
  });

  const url = new URL(href);

  await page.goto(url.pathname + url.search);

  const btn = page.getByTestId('import-template-to-workspace-btn');

  await btn.isVisible();
  await btn.click();
  await waitForEditorLoad(page);
});
