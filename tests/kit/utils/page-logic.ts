import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function waitForEditorLoad(page: Page) {
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });
}

export async function waitForAllPagesLoad(page: Page) {
  // if filters tag is rendered, we believe all_pages is ready
  await page.waitForSelector('[data-testid="create-first-filter"]', {
    timeout: 1000,
  });
}

export async function clickNewPageButton(page: Page) {
  // fixme(himself65): if too fast, the page will crash
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await waitForEditorLoad(page);
}

export function getBlockSuiteEditorTitle(page: Page) {
  return page.locator('.affine-doc-page-block-title').nth(0);
}

export async function type(page: Page, content: string, delay = 50) {
  await page.keyboard.type(content, { delay });
}

export const createLinkedPage = async (page: Page, pageName?: string) => {
  await page.keyboard.type('@', { delay: 50 });
  const linkedPagePopover = page.locator('.linked-page-popover');
  await expect(linkedPagePopover).toBeVisible();
  if (pageName) {
    await type(page, pageName);
  } else {
    pageName = 'Untitled';
  }

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter', { delay: 50 });
};

export async function clickPageMoreActions(page: Page) {
  return page
    .getByTestId('header')
    .getByTestId('header-dropDownButton')
    .click();
}
