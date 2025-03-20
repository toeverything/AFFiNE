import { test } from '@affine-test/kit/playwright';
import { pasteContent } from '@affine-test/kit/utils/clipboard';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
  locateEditorContainer,
} from '@affine-test/kit/utils/editor';
import {
  copyByKeyboard,
  pasteByKeyboard,
  pressEnter,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { setSelection } from '@affine-test/kit/utils/selection';
import type { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import { expect, type Page } from '@playwright/test';

const paragraphLocator = 'affine-note affine-paragraph';

// Helper function to create paragraph blocks with text
async function createParagraphBlocks(page: Page, texts: string[]) {
  for (const text of texts) {
    await pressEnter(page);
    await type(page, text);
  }
}

// Helper function to verify paragraph text content
async function verifyParagraphContent(
  page: Page,
  index: number,
  expectedText: string
) {
  expect(
    await page
      .locator(paragraphLocator)
      .nth(index)
      .evaluate(
        (block: ParagraphBlockComponent, expected: string) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === expected,
        expectedText
      )
  ).toBeTruthy();
}

// Helper function to get paragraph block ids
async function getParagraphIds(page: Page) {
  const paragraph = page.locator(paragraphLocator);
  const paragraphIds = await paragraph.evaluateAll(
    (blocks: ParagraphBlockComponent[]) => blocks.map(block => block.model.id)
  );
  return { paragraphIds };
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page, 'Clipboard Test');
  await waitForEditorLoad(page);
});

test.describe('paste in multiple blocks text selection', () => {
  test('paste plain text', async ({ page }) => {
    const texts = ['hello world', 'hello world', 'hello world'];
    await createParagraphBlocks(page, texts);

    const { paragraphIds } = await getParagraphIds(page);

    /**
     * select text cross the 3 blocks:
     * hello |world
     * hello world
     * hello| world
     */
    await setSelection(page, paragraphIds[0], 6, paragraphIds[2], 5);

    await pasteContent(page, { 'text/plain': 'test' });

    /**
     * after paste:
     * hello test world
     */
    await verifyParagraphContent(page, 0, 'hello test world');
  });

  test('paste snapshot', async ({ page }) => {
    // Create initial test blocks
    await createParagraphBlocks(page, ['test', 'test']);

    // Create target blocks
    await createParagraphBlocks(page, [
      'hello world',
      'hello world',
      'hello world',
    ]);

    /**
     * before paste:
     * test
     * test
     * hello world
     * hello world
     * hello world
     */
    const { paragraphIds } = await getParagraphIds(page);

    /**
     * select the first 2 blocks:
     * |test
     * test|
     * hello world
     * hello world
     * hello world
     */
    await setSelection(page, paragraphIds[0], 0, paragraphIds[1], 4);
    // copy the first 2 blocks
    await copyByKeyboard(page);

    /**
     * select the last 3 blocks:
     * test
     * test
     * hello |world
     * hello world
     * hello| world
     */
    await setSelection(page, paragraphIds[2], 6, paragraphIds[4], 5);

    // paste the first 2 blocks
    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    /**
     * after paste:
     * test
     * test
     * hello test
     * test world
     */
    await verifyParagraphContent(page, 2, 'hello test');
    await verifyParagraphContent(page, 3, 'test world');
  });
});

test('paste surface-ref block to another doc as embed-linked-doc block', async ({
  page,
}) => {
  await openHomePage(page);
  await clickNewPageButton(page, 'Clipboard Test');
  await waitForEditorLoad(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();

  // add a shape
  await page.keyboard.press('s');
  // click to add a shape
  await container.click({ position: { x: 100, y: 500 } });
  await page.waitForTimeout(50);
  // add a frame
  await page.keyboard.press('f');
  await page.waitForTimeout(50);

  // click on the frame title to trigger the change frame button toolbar
  const frameTitle = page.locator('affine-frame-title');
  await frameTitle.click();
  await page.waitForTimeout(50);

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  const insertIntoPageButton = toolbar.getByLabel('Insert into Page');
  await insertIntoPageButton.click();

  await clickPageModeButton(page);
  await page.waitForTimeout(50);

  // copy surface-ref block
  const surfaceRefBlock = page.locator('.affine-surface-ref');
  await surfaceRefBlock.click();
  await page.waitForTimeout(50);
  await copyByKeyboard(page);

  // paste to another doc
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  const title2 = getBlockSuiteEditorTitle(page);
  await title2.pressSequentially('page2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);

  // paste the surface-ref block
  await pasteByKeyboard(page);
  await page.waitForTimeout(50);

  const embedLinkedDocBlock = page.locator('affine-embed-linked-doc-block');
  await expect(embedLinkedDocBlock).toBeVisible();
  const embedLinkedDocBlockTitle = embedLinkedDocBlock.locator(
    '.affine-embed-linked-doc-content-title-text'
  );
  await expect(embedLinkedDocBlockTitle).toHaveText('Clipboard Test');
});
