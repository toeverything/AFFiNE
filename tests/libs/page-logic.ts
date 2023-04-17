import type { Page } from '@playwright/test';

export async function waitMarkdownImported(page: Page) {
  await page.waitForSelector('v-line');
}

export async function newPage(page: Page) {
  // fixme(himself65): if too fast, the page will crash
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
}

export function getBlockSuiteEditorTitle(page: Page) {
  return page.locator('v-line').nth(0);
}

export async function clickPageMoreActions(page: Page) {
  return page
    .getByTestId('editor-header-items')
    .getByTestId('editor-option-menu')
    .click();
}

export async function createPinboardPage(
  page: Page,
  parentId: string,
  title: string
) {
  await newPage(page);
  await page.focus('.affine-default-page-block-title');
  await page.type('.affine-default-page-block-title', title, {
    delay: 100,
  });
  await clickPageMoreActions(page);
  await page.getByTestId('move-to-menu-item').click();
  await page
    .getByTestId('pinboard-menu')
    .getByTestId(`pinboard-${parentId}`)
    .click();
}
