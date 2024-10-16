import { test } from '@affine-test/kit/mobile';
import { getBlockSuiteEditorTitle } from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

import { expandCollapsibleSection, pageBack } from './utils';

test('Create new doc in favorites', async ({ page }) => {
  const section = await expandCollapsibleSection(page, 'favorites');
  const newButton = section.getByTestId('explorer-bar-add-favorite-button');
  await newButton.tap();

  // const testTitleText = 'Test Favorited Doc';
  const title = getBlockSuiteEditorTitle(page);
  await expect(title).toBeVisible();
  // TODO(@CatsJuice): Mobile editor is not ready yet
  // await title.fill(testTitleText);
  const docId = getCurrentDocIdFromUrl(page);

  await pageBack(page);
  const section2 = await expandCollapsibleSection(page, 'favorites');
  const node = section2.getByTestId(`explorer-doc-${docId}`);
  await expect(node).toBeVisible();

  // const label = node.getByText(testTitleText);
  // await expect(label).toBeVisible();
});
