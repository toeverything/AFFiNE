import { locateEditorContainer } from '@affine-test/kit/utils/editor';
import { pressEnter } from '@affine-test/kit/utils/keyboard';
import {
  getBlockSuiteEditorTitle,
  type,
} from '@affine-test/kit/utils/page-logic';
import type { Locator, Page } from '@playwright/test';

export async function createTitle(page: Page) {
  const title = getBlockSuiteEditorTitle(page);
  await title.scrollIntoViewIfNeeded();
  await title.click();
  await type(page, 'Title');
  await pressEnter(page);
  return title;
}

export async function createHeadings(page: Page, gap = 0) {
  const editorContainer = locateEditorContainer(page);

  const headings: Locator[] = [];
  await pressEnter(page, gap + 1);
  for (let i = 1; i <= 6; i++) {
    await type(page, `${'#'.repeat(i)} Heading ${i}`);
    headings.push(editorContainer.locator(`.h${i}`));
    await pressEnter(page, gap + 1);
  }
  return headings;
}

export async function getVerticalCenterFromLocator(locator: Locator) {
  const rect = await locator.boundingBox();
  return rect!.y + rect!.height / 2;
}
