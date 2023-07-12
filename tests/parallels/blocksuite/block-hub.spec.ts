import { test } from '@affine-test/kit/playwright';

import { checkBlockHub } from '../../libs/editor';
import { openHomePage } from '../../libs/load-page';
import { newPage, waitEditorLoad } from '../../libs/page-logic';

test('block-hub should work', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await checkBlockHub(page);
  await newPage(page);
  await page.waitForTimeout(500);
  await checkBlockHub(page);
});
