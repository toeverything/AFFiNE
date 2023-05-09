import { test } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { clickSideBarAllPageButton } from '../libs/sidebar';

test('all page', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarAllPageButton(page);
});
