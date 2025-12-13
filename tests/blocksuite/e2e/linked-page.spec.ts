import { expect, type Page } from '@playwright/test';

import {
  addNewPage,
  getDebugMenu,
  switchToPage,
} from './utils/actions/click.js';
import { dragBetweenIndices, dragBlockToPoint } from './utils/actions/drag.js';
import { switchEditorMode } from './utils/actions/edgeless.js';
import {
  copyByKeyboard,
  cutByKeyboard,
  pasteByKeyboard,
  pressArrowLeft,
  pressBackspace,
  pressEnter,
  pressEscape,
  selectAllByKeyboard,
  SHORT_KEY,
  type,
} from './utils/actions/keyboard.js';
import { getLinkedDocPopover } from './utils/actions/linked-doc.js';
import {
  captureHistory,
  enterPlaygroundRoom,
  focusRichText,
  focusTitle,
  getPageSnapshot,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  setInlineRangeInSelectedRichText,
  waitNextFrame,
} from './utils/actions/misc.js';
import {
  assertParentBlockFlavour,
  assertRichTexts,
  assertTitle,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';

async function createAndConvertToEmbedLinkedDoc(page: Page) {
  const { createLinkedDoc } = getLinkedDocPopover(page);
  const linkedDoc = await createLinkedDoc('page1');
  const lickedDocBox = await linkedDoc.boundingBox();
  if (!lickedDocBox) {
    throw new Error('lickedDocBox is not found');
  }
  await page.mouse.move(
    lickedDocBox.x + lickedDocBox.width / 2,
    lickedDocBox.y + lickedDocBox.height / 2
  );

  await waitNextFrame(page, 200);
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();

  const switchButton = toolbar.getByRole('button', { name: 'Switch view' });
  await switchButton.click();

  const embedLinkedDocBtn = toolbar.getByRole('button', { name: 'Card view' });
  await expect(embedLinkedDocBtn).toBeVisible();
  await embedLinkedDocBtn.click();
  await waitNextFrame(page, 200);
}

test.describe('multiple page', () => {
  test('should create and switch page work', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusTitle(page);
    await type(page, 'title0');
    await focusRichText(page);
    await type(page, 'page0');
    await assertRichTexts(page, ['page0']);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );

    const { id } = await addNewPage(page);
    await switchToPage(page, id);
    await focusTitle(page);
    await type(page, 'title1');
    await focusRichText(page);
    await type(page, 'page1');
    await assertRichTexts(page, ['page1']);

    await switchToPage(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_final.json`
    );
  });
});

test.describe('reference node', () => {
  test('linked doc popover can show and hide correctly', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '[[');

    // `[[` should be converted to `@`
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
    const { linkedDocPopover } = getLinkedDocPopover(page);
    await expect(linkedDocPopover).toBeVisible();
    await pressEscape(page);
    await expect(linkedDocPopover).toBeHidden();
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await assertRichTexts(page, ['@@']);
    await pressBackspace(page);
    await expect(linkedDocPopover).toBeHidden();
  });

  test('linked doc popover should not show when the current content is @xx and pressing backspace', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '@');
    await page.keyboard.press('Escape');
    await type(page, 'a');

    const { linkedDocPopover } = getLinkedDocPopover(page);
    await expect(linkedDocPopover).toBeHidden();

    await pressBackspace(page);
    await expect(linkedDocPopover).toBeHidden();
  });

  test('close doc popover when start with space', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '@d');
    const { linkedDocPopover } = getLinkedDocPopover(page);
    await expect(linkedDocPopover).toBeVisible();
    await pressBackspace(page);
    await expect(linkedDocPopover).toBeVisible();
    await type(page, ' ');
    await expect(linkedDocPopover).toBeHidden();
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await type(page, ' ');
    await expect(linkedDocPopover).toBeHidden();
  });

  test('should reference node attributes correctly', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await addNewPage(page);
    await focusRichText(page);
    await type(page, '[[');
    await pressEnter(page);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_1.json`
    );

    await pressBackspace(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_2.json`
    );
  });

  test('should reference node can be selected', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await addNewPage(page);
    await focusRichText(page);

    await type(page, '1');
    await type(page, '[[');
    await pressEnter(page);

    await assertRichTexts(page, ['1 ']);
    await type(page, '2');
    await assertRichTexts(page, ['1 2']);
    await page.keyboard.press('ArrowLeft');
    await type(page, '3');
    await assertRichTexts(page, ['1 32']);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    // select the reference node
    await page.keyboard.press('ArrowLeft');

    // delete the reference node and insert text
    await type(page, '4');
    await assertRichTexts(page, ['1432']);
  });

  test('text inserted in the between of reference nodes should not be extend attributes', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await addNewPage(page);
    await focusRichText(page);

    await type(page, '1');
    await type(page, '@');
    await pressEnter(page);
    await type(page, '@');
    await pressEnter(page);

    await assertRichTexts(page, ['1  ']);
    await type(page, '2');
    await assertRichTexts(page, ['1  2']);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await type(page, '3');
    await assertRichTexts(page, ['1 3 2']);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });

  test('text can be inserted as expected when reference node is in the start or end of line', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await addNewPage(page);
    await focusRichText(page);

    await type(page, '@');
    await pressEnter(page);
    await type(page, '@');
    await pressEnter(page);

    await assertRichTexts(page, ['  ']);
    await type(page, '2');
    await assertRichTexts(page, ['  2']);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await type(page, '3');
    await assertRichTexts(page, [' 3 2']);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await type(page, '1');
    await assertRichTexts(page, ['1 3 2']);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });

  test('should the cursor move correctly around reference node', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await addNewPage(page);
    await focusRichText(page);

    await type(page, '1');
    await type(page, '[[');
    await pressEnter(page);

    await assertRichTexts(page, ['1 ']);
    await type(page, '2');
    await assertRichTexts(page, ['1 2']);
    await page.keyboard.press('ArrowLeft');
    await type(page, '3');
    await assertRichTexts(page, ['1 32']);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');
    await waitNextFrame(page);
    await page.keyboard.press('ArrowLeft');

    await type(page, '4');
    await assertRichTexts(page, ['14 32']);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_1.json`
    );

    await page.keyboard.press('ArrowRight');
    await captureHistory(page);
    await pressBackspace(page);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_2.json`
    );
  });

  test('should create reference node works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    const defaultPageId = 'doc:home';
    const { id: newId } = await addNewPage(page);
    await switchToPage(page, newId);
    await focusTitle(page);
    await type(page, 'title');
    await switchToPage(page, defaultPageId);

    await focusRichText(page);
    await type(page, '@');
    const {
      linkedDocPopover,
      refNode,
      assertExistRefText: assertReferenceText,
    } = getLinkedDocPopover(page);
    await expect(linkedDocPopover).toBeVisible();
    await pressEnter(page);
    await expect(linkedDocPopover).toBeHidden();
    await assertRichTexts(page, [' ']);
    await expect(refNode).toBeVisible();
    await expect(refNode).toHaveCount(1);
    await assertReferenceText('title');

    await switchToPage(page, newId);
    await focusTitle(page);
    await pressBackspace(page);
    await type(page, '1');
    await switchToPage(page, defaultPageId);
    await assertReferenceText('titl1');
  });

  test('can create linked page and jump', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusTitle(page);
    await type(page, 'page0');

    await focusRichText(page);
    const { createLinkedDoc, findRefNode } = getLinkedDocPopover(page);
    const linkedNode = await createLinkedDoc('page1');
    await linkedNode.click();

    await assertTitle(page, 'page1');
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );
    await focusRichText(page);
    await type(page, '@page0');
    await pressEnter(page);
    const refNode = await findRefNode('page0');
    await refNode.click();
    await assertTitle(page, 'page0');
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_final.json`
    );
  });

  test('should not merge consecutive identical reference nodes for rendering', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'issue',
      description: 'https://github.com/toeverything/blocksuite/issues/2136',
    });
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '[[');
    await pressEnter(page);
    await type(page, '[[');
    await pressEnter(page);

    const { refNode } = getLinkedDocPopover(page);
    await assertRichTexts(page, ['  ']);
    await expect(refNode).toHaveCount(2);
  });
});

test.describe('linked page popover', () => {
  test('should show linked page popover show and hide', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    const { linkedDocPopover } = getLinkedDocPopover(page);

    await type(page, '[[');
    await expect(linkedDocPopover).toBeVisible();
    await pressBackspace(page);
    await expect(linkedDocPopover).toBeHidden();

    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(linkedDocPopover).toBeHidden();

    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await copyByKeyboard(page);
    await expect(linkedDocPopover).toBeHidden();
  });

  test('should fuzzy search works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    const {
      linkedDocPopover,
      pageBtn,
      assertExistRefText,
      assertActivePageIdx,
    } = getLinkedDocPopover(page);

    await focusTitle(page);
    await type(page, 'page0');

    const page1 = await addNewPage(page);
    await switchToPage(page, page1.id);
    await focusTitle(page);
    await type(page, 'page1');

    const page2 = await addNewPage(page);
    await switchToPage(page, page2.id);
    await focusTitle(page);
    await type(page, 'page2');

    await switchToPage(page);
    await focusRichText(page);
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await expect(pageBtn).toHaveCount(4);

    await assertActivePageIdx(0);
    await page.keyboard.press('ArrowDown');
    await assertActivePageIdx(1);

    await page.keyboard.press('ArrowUp');
    await assertActivePageIdx(0);
    await page.keyboard.press('Tab');
    await assertActivePageIdx(1);
    await page.keyboard.press('Shift+Tab');
    await assertActivePageIdx(0);

    await expect(pageBtn).toHaveText([
      'page1',
      'page2',
      'Create "Untitled" doc',
      'Import',
    ]);
    // page2
    //  ^  ^
    await type(page, 'a2');
    await expect(pageBtn).toHaveCount(3);
    await expect(pageBtn).toHaveText(['page2', 'Create "a2" doc', 'Import']);
    await pressEnter(page);
    await expect(linkedDocPopover).toBeHidden();
    await assertExistRefText('page2');
  });

  test('should paste query works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);

    await (async () => {
      for (let index = 0; index < 3; index++) {
        const newPage = await addNewPage(page);
        await switchToPage(page, newPage.id);
        await focusTitle(page);
        await type(page, 'page' + index);
      }
    })();

    await switchToPage(page);
    await getDebugMenu(page).pagesBtn.click();
    await focusRichText(page);
    await type(page, 'e2');
    await setInlineRangeInSelectedRichText(page, 0, 2);
    await cutByKeyboard(page);

    const { pageBtn, linkedDocPopover } = getLinkedDocPopover(page);
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await expect(pageBtn).toHaveText([
      'page0',
      'page1',
      'page2',
      'Create "Untitled" doc',
      'Import',
    ]);

    await page.keyboard.press(`${SHORT_KEY}+v`);
    await expect(linkedDocPopover).toBeVisible();
    await expect(pageBtn).toHaveText(['page2', 'Create "e2" doc', 'Import']);
  });

  test('should multiple paste query not works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);

    await (async () => {
      for (let index = 0; index < 3; index++) {
        const newPage = await addNewPage(page);
        await switchToPage(page, newPage.id);
        await focusTitle(page);
        await type(page, 'page' + index);
      }
    })();

    await switchToPage(page);
    await getDebugMenu(page).pagesBtn.click();
    await focusRichText(page);
    await type(page, 'pa');
    await pressEnter(page);
    await type(page, 'ge');
    await pressEnter(page);
    await type(page, '2');

    await selectAllByKeyboard(page);
    await waitNextFrame(page, 200);
    await selectAllByKeyboard(page);
    await waitNextFrame(page, 200);
    await selectAllByKeyboard(page);
    await waitNextFrame(page, 200);
    await cutByKeyboard(page);
    const note = page.locator('affine-note');
    await note.click({ force: true, position: { x: 100, y: 100 } });
    await waitNextFrame(page, 200);

    const { pageBtn, linkedDocPopover } = getLinkedDocPopover(page);
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    await expect(pageBtn).toHaveText([
      'page0',
      'page1',
      'page2',
      'Create "Untitled" doc',
      'Import',
    ]);

    await page.keyboard.press(`${SHORT_KEY}+v`);
    await expect(linkedDocPopover).not.toBeVisible();
  });

  test('should more docs works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);

    await (async () => {
      for (let index = 0; index < 10; index++) {
        const newPage = await addNewPage(page);
        await switchToPage(page, newPage.id);
        await focusTitle(page);
        await type(page, 'page' + index);
      }
    })();

    await switchToPage(page);
    await getDebugMenu(page).pagesBtn.click();
    await focusRichText(page);
    await type(page, '@');

    const { pageBtn, linkedDocPopover } = getLinkedDocPopover(page);
    await expect(linkedDocPopover).toBeVisible();
    await expect(pageBtn).toHaveText([
      ...Array.from({ length: 6 }, (_, index) => `page${index}`),
      '4 more docs',
      'Create "Untitled" doc',
      'Import',
    ]);

    const moreNode = page.locator(`icon-button[data-id="Link to Doc More"]`);
    await moreNode.click();
    await expect(pageBtn).toHaveText([
      ...Array.from({ length: 10 }, (_, index) => `page${index}`),
      'Create "Untitled" doc',
      'Import',
    ]);
  });
});

test.describe('linked page with clipboard', () => {
  test('paste linked page should paste as linked page', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const { createLinkedDoc } = getLinkedDocPopover(page);

    await createLinkedDoc('page1');

    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    await focusRichText(page);
    await pasteByKeyboard(page);
    const json = await getPageSnapshot(page, true);
    expect(json).toMatchSnapshot(`${testInfo.title}.json`);
  });

  test('duplicated linked page should paste as linked page', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const { createLinkedDoc } = getLinkedDocPopover(page);

    await createLinkedDoc('page0');

    await type(page, '/duplicate');
    await pressEnter(page);
    const json = await getPageSnapshot(page, true);
    expect(json).toMatchSnapshot(`${testInfo.title}.json`);
  });
});

test('should [[Selected text]] converted to linked page', async ({
  page,
}, testInfo) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/2730',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '1234');

  await dragBetweenIndices(page, [0, 1], [0, 2]);
  await type(page, '[');
  await assertRichTexts(page, ['1[2]34']);
  await type(page, '[');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
  await switchToPage(page, '3');
  await assertTitle(page, '2');
});

test('add reference node before the other reference node', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');

  const firstRefNode = page.locator('affine-reference').nth(0);

  await type(page, '@bbb');
  await pressEnter(page);

  expect(await firstRefNode.textContent()).toEqual(
    expect.stringContaining('bbb')
  );
  expect(await firstRefNode.textContent()).not.toEqual(
    expect.stringContaining('ccc')
  );

  await pressArrowLeft(page, 3);
  await type(page, '@ccc');
  await pressEnter(page);

  expect(await firstRefNode.textContent()).not.toEqual(
    expect.stringContaining('bbb')
  );
  expect(await firstRefNode.textContent()).toEqual(
    expect.stringContaining('ccc')
  );
});

test('linked doc can be dragged from note to surface top level block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusTitle(page);
  await type(page, 'title0');
  await focusRichText(page);
  await createAndConvertToEmbedLinkedDoc(page);

  await switchEditorMode(page);
  await page.mouse.dblclick(450, 450);

  await dragBlockToPoint(page, '9', { x: 200, y: 200 });

  await waitNextFrame(page);
  await assertParentBlockFlavour(page, '9', 'affine:surface');
});

// TODO(@fundon): should move to affine
// Aliases
test.describe.skip('Customize linked doc title and description', () => {
  // Inline View
  test('should set a custom title for inline link', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusTitle(page);
    await type(page, 'title0');
    await focusRichText(page);
    await type(page, 'page0');
    await assertRichTexts(page, ['page0']);

    const { id } = await addNewPage(page);
    await switchToPage(page, id);
    await focusTitle(page);
    await type(page, 'title1');
    await focusRichText(page);
    await type(page, 'page1');
    await assertRichTexts(page, ['page1']);

    await getDebugMenu(page).pagesBtn.click();

    await focusRichText(page);
    await type(page, '@title0');
    await pressEnter(page);

    const { findRefNode } = getLinkedDocPopover(page);
    const page0 = await findRefNode('title0');
    await page0.hover();

    await waitNextFrame(page, 200);
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(toolbar).toBeVisible();

    const editButton = toolbar.getByRole('button', { name: 'Edit' });
    await editButton.click();

    await waitNextFrame(page, 200);
    const popup = page.locator('reference-popup .popover-container');
    await expect(popup).toBeVisible();

    const input = popup.locator('input');
    await expect(input).toBeFocused();

    // title alias
    await type(page, 'page0-title0');
    await pressEnter(page);

    await page.mouse.click(0, 0);

    await focusRichText(page);
    await waitNextFrame(page, 200);

    const page0Alias = await findRefNode('page0-title0');
    await page0Alias.hover();

    await waitNextFrame(page, 200);
    await expect(toolbar).toBeVisible();

    // original title button
    const docTitle = toolbar.getByRole('button', { name: 'Doc title' });
    await expect(docTitle).toHaveText('title0', { useInnerText: true });

    // reedit
    await editButton.click();

    await waitNextFrame(page, 200);

    // reset
    await popup.getByRole('button', { name: 'Reset' }).click();

    await waitNextFrame(page, 200);

    const resetedPage0 = await findRefNode('title0');
    await resetedPage0.hover();

    await waitNextFrame(page, 200);
    await expect(toolbar).toBeVisible();
    await expect(docTitle).not.toBeVisible();
  });

  // Card View
  test('should set a custom title and description for card link', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusTitle(page);
    await type(page, 'title0');

    const { id } = await addNewPage(page);
    await switchToPage(page, id);
    await focusTitle(page);
    await type(page, 'title1');

    await getDebugMenu(page).pagesBtn.click();

    await focusRichText(page);
    await type(page, '@title0');
    await pressEnter(page);

    const { findRefNode } = getLinkedDocPopover(page);
    const page0 = await findRefNode('title0');
    await page0.hover();

    await waitNextFrame(page, 200);
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    let editButton = toolbar.getByRole('button', { name: 'Edit' });
    await editButton.click();

    // title alias
    await type(page, 'page0-title0');
    await pressEnter(page);

    await focusRichText(page);
    await waitNextFrame(page, 200);

    const page0Alias = await findRefNode('page0-title0');
    await page0Alias.hover();

    await waitNextFrame(page, 200);
    const switchButton = toolbar.getByRole('button', {
      name: 'Switch view',
    });
    await switchButton.click();

    // switches to card view
    const toCardButton = toolbar.getByRole('button', {
      name: 'Card view',
    });
    await toCardButton.click();

    await waitNextFrame(page, 200);
    const linkedDocBlock = page.locator('affine-embed-linked-doc-block');
    await expect(linkedDocBlock).toBeVisible();

    const linkedDocBlockTitle = linkedDocBlock.locator(
      '.affine-embed-linked-doc-content-title-text'
    );
    await expect(linkedDocBlockTitle).toHaveText('page0-title0');

    await linkedDocBlock.click();

    await waitNextFrame(page, 200);
    const docTitleButton = toolbar.getByRole('button', {
      name: 'Doc title',
    });
    await expect(docTitleButton).toBeVisible();

    editButton = toolbar.getByRole('button', { name: 'Edit' });
    await editButton.click();

    await waitNextFrame(page, 200);
    const editModal = page.locator('embed-card-edit-modal');
    const resetButton = editModal.getByRole('button', { name: 'Reset' });
    const saveButton = editModal.getByRole('button', { name: 'Save' });

    // clears aliases
    await resetButton.click();

    await waitNextFrame(page, 200);
    await expect(linkedDocBlockTitle).toHaveText('title0');

    await linkedDocBlock.click();

    await waitNextFrame(page, 200);
    await editButton.click();

    await waitNextFrame(page, 200);

    // title alias
    await type(page, 'page0-title0');
    await page.keyboard.press('Tab');
    // description alias
    await type(page, 'This is a new description');

    // saves aliases
    await saveButton.click();

    await waitNextFrame(page, 200);
    await expect(linkedDocBlockTitle).toHaveText('page0-title0');
    await expect(
      page.locator('.affine-embed-linked-doc-content-note.alias')
    ).toHaveText('This is a new description');
  });

  // Embed View
  test('should automatically switch to card view and set a custom title and description', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusTitle(page);
    await type(page, 'title0');

    const { id } = await addNewPage(page);
    await switchToPage(page, id);
    await focusTitle(page);
    await type(page, 'title1');

    await getDebugMenu(page).pagesBtn.click();

    await focusRichText(page);
    await type(page, '@title0');
    await pressEnter(page);

    const { findRefNode } = getLinkedDocPopover(page);
    const page0 = await findRefNode('title0');
    await page0.hover();

    await waitNextFrame(page, 200);
    const referencePopup = page.locator('.affine-reference-popover-container');

    let editButton = referencePopup.getByRole('button', { name: 'Edit' });
    await editButton.click();

    // title alias
    await type(page, 'page0-title0');
    await pressEnter(page);

    await focusRichText(page);
    await waitNextFrame(page, 200);

    const page0Alias = await findRefNode('page0-title0');
    await page0Alias.hover();

    await waitNextFrame(page, 200);
    let switchButton = referencePopup.getByRole('button', {
      name: 'Switch view',
    });
    await switchButton.click();

    // switches to card view
    const toCardButton = referencePopup.getByRole('button', {
      name: 'Card view',
    });
    await toCardButton.click();

    await waitNextFrame(page, 200);
    const linkedDocBlock = page.locator('affine-embed-linked-doc-block');

    await linkedDocBlock.click();

    await waitNextFrame(page, 200);
    const cardToolbar = page.locator('affine-embed-card-toolbar');
    switchButton = cardToolbar.getByRole('button', { name: 'Switch view' });
    await switchButton.click();

    await waitNextFrame(page, 200);

    // switches to embed view
    const toEmbedButton = cardToolbar.getByRole('button', {
      name: 'Embed view',
    });
    await toEmbedButton.click();

    await waitNextFrame(page, 200);
    const syncedDocBlock = page.locator('affine-embed-synced-doc-block');

    await syncedDocBlock.click();

    await waitNextFrame(page, 200);
    const syncedDocBlockTitle = syncedDocBlock.locator(
      '.affine-embed-synced-doc-title'
    );
    await expect(syncedDocBlockTitle).toHaveText('title0');

    await syncedDocBlock.click();

    await waitNextFrame(page, 200);
    editButton = cardToolbar.getByRole('button', { name: 'Edit' });
    await editButton.click();

    await waitNextFrame(page, 200);
    const editModal = page.locator('embed-card-edit-modal');
    const cancelButton = editModal.getByRole('button', { name: 'Cancel' });
    const saveButton = editModal.getByRole('button', { name: 'Save' });

    // closes edit-model
    await cancelButton.click();

    await waitNextFrame(page, 200);
    await expect(editModal).not.toBeVisible();

    await syncedDocBlock.click();

    await waitNextFrame(page, 200);
    await editButton.click();

    await waitNextFrame(page, 200);

    // title alias
    await type(page, 'page0-title0');
    await page.keyboard.press('Tab');
    // description alias
    await type(page, 'This is a new description');

    // saves aliases
    await saveButton.click();

    await waitNextFrame(page, 200);

    // automatically switch to card view
    await expect(syncedDocBlock).not.toBeVisible();

    await expect(linkedDocBlock).toBeVisible();
    const linkedDocBlockTitle = linkedDocBlock.locator(
      '.affine-embed-linked-doc-content-title-text'
    );
    await expect(linkedDocBlockTitle).toHaveText('page0-title0');
    await expect(
      linkedDocBlock.locator('.affine-embed-linked-doc-content-note.alias')
    ).toHaveText('This is a new description');
  });

  // Embed View
  test.fixme('should automatically switch to card view and set a custom title and description on edgeless', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await focusRichText(page);
    await createAndConvertToEmbedLinkedDoc(page);

    await switchEditorMode(page);
    await page.mouse.dblclick(450, 450);

    await dragBlockToPoint(page, '9', { x: 200, y: 200 });

    await waitNextFrame(page);

    const toolbar = page.locator('editor-toolbar');
    await toolbar.getByRole('button', { name: 'Switch view' }).click();
    await toolbar.getByRole('button', { name: 'Embed view' }).click();

    await waitNextFrame(page);

    await toolbar.getByRole('button', { name: 'Edit' }).click();

    await waitNextFrame(page);
    const editModal = page.locator('embed-card-edit-modal');
    const saveButton = editModal.getByRole('button', { name: 'Save' });

    // title alias
    await type(page, 'page0-title0');
    await page.keyboard.press('Tab');
    // description alias
    await type(page, 'This is a new description');

    // saves aliases
    await saveButton.click();

    await waitNextFrame(page);

    const syncedDocBlock = page.locator(
      'affine-embed-edgeless-synced-doc-block'
    );

    await expect(syncedDocBlock).toBeHidden();

    const linkedDocBlock = page.locator(
      'affine-embed-edgeless-linked-doc-block'
    );

    await expect(linkedDocBlock).toBeVisible();

    const linkedDocBlockTitle = linkedDocBlock.locator(
      '.affine-embed-linked-doc-content-title-text'
    );
    await expect(linkedDocBlockTitle).toHaveText('page0-title0');
    await expect(
      linkedDocBlock.locator('.affine-embed-linked-doc-content-note.alias')
    ).toHaveText('This is a new description');
  });
});
