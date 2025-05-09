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
