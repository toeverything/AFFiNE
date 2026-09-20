import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  addCodeBlock,
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import type { Page } from '@playwright/test';

export const gotoContentFromTitle = async (page: Page) => {
  await page.keyboard.press('Enter');
};

export const createNewPage = async (page: Page) => {
  await clickNewPageButton(page);
};

export const initCodeBlockByOneStep = async (page: Page) => {
  await openHomePage(page);
  await createNewPage(page);
  await waitForEditorLoad(page);
  await gotoContentFromTitle(page);
  await addCodeBlock(page);
};

/**
 * Opens the "More" menu on the first code block and returns locators for
 * the line-number toggle buttons inside it.
 * Uses .first() to stay deterministic when multiple code blocks are present.
 */
export const openCodeBlockMoreMenu = async (page: Page) => {
  const codeBlock = page.locator('affine-code').first();
  await codeBlock.hover();

  const moreButton = page
    .locator('affine-code-toolbar')
    .getByRole('button', { name: 'More' });
  await moreButton.click();

  const menu = page.locator('.more-popup-menu');
  const lineNumberButton = menu.getByRole('button', { name: 'Line number' });
  const cancelLineNumberButton = menu.getByRole('button', {
    name: 'Cancel line number',
  });

  return { menu, lineNumberButton, cancelLineNumberButton };
};
