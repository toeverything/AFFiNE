import { resolve } from 'node:path';

import { test } from '../libs/playwright';
import { openHomePage } from '../libs/utils';

const root = resolve(__dirname, '..');
const temp = resolve(root, '.temp');

test('first page', async ({ page }) => {
  await openHomePage(page);
  await page.waitForSelector('.affine-block-children-container');
  await page.screenshot({
    path: resolve(temp, 'first-page.png'),
  });
});
