import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

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

export async function type(page: Page, content: string, delay = 50) {
  await page.keyboard.type(content, { delay });
}

export async function pressEnter(page: Page) {
  // avoid flaky test by simulate real user input
  await page.keyboard.press('Enter', { delay: 50 });
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
    .getByTestId('editor-header-items')
    .getByTestId('editor-option-menu')
    .click();
}
