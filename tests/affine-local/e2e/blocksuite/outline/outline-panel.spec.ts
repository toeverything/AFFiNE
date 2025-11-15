import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
  clickView,
  createEdgelessNoteBlock,
  focusDocTitle,
  getEdgelessSelectedIds,
  getViewportCenter,
  locateToolbar,
  setViewportCenter,
} from '@affine-test/kit/utils/editor';
import {
  pressBackspace,
  pressEnter,
  pressEscape,
  selectAllByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  closeSettingModal,
  confirmExperimentalPrompt,
  openExperimentalFeaturesPanel,
  openSettingModal,
} from '@affine-test/kit/utils/setting';
import { openRightSideBar } from '@affine-test/kit/utils/sidebar';
import { expect, type Locator, type Page } from '@playwright/test';

import {
  createHeadings,
  createTitle,
  getVerticalCenterFromLocator,
} from './utils';

async function openTocPanel(page: Page) {
  const toc = page.locator('affine-outline-panel');
  if (await toc.isVisible()) return toc;

  await openRightSideBar(page, 'outline');
  await toc.waitFor({ state: 'visible' });
  return toc;
}

function getTocHeading(panel: Locator, level: number) {
  return panel.getByTestId(`outline-block-preview-h${level}`).locator('span');
}

// locate cards in outline panel
// ! Please note that when any card mode changed, the locator will be mutated
function locateCards(toc: Locator, mode?: 'both' | 'page' | 'edgeless') {
  const cards = toc.locator('affine-outline-note-card');
  return mode
    ? cards.locator(`>div[data-visibility="${mode}"]`)
    : cards.locator('>div');
}

function locateSortingButton(panel: Locator) {
  return panel.getByTestId('toggle-notes-sorting-button');
}

async function changeNoteDisplayMode(
  card: Locator,
  mode: 'both' | 'doc' | 'edgeless'
) {
  await card.hover();
  await card.getByTestId('display-mode-button').click();
  await card.locator(`note-display-mode-panel .item.${mode}`).click();
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
});

test.describe('TOC display', () => {
  test('should display title and headings when there are non-empty headings in editor', async ({
    page,
  }) => {
    await createTitle(page);
    await createHeadings(page);

    const toc = await openTocPanel(page);

    await expect(toc.getByTestId('outline-block-preview-title')).toBeVisible();
    for (let i = 1; i <= 6; i++) {
      await expect(getTocHeading(toc, i)).toBeVisible();
      await expect(getTocHeading(toc, i)).toContainText(`Heading ${i}`);
    }
  });

  test('should display placeholder when no headings', async ({ page }) => {
    const toc = await openTocPanel(page);
    const noHeadingPlaceholder = toc.getByTestId('empty-panel-placeholder');

    await createTitle(page);
    await pressEnter(page);
    await type(page, 'hello world');

    await expect(noHeadingPlaceholder).toBeVisible();
  });

  test('should not display headings when there are only empty headings', async ({
    page,
  }) => {
    await createTitle(page);

    // create empty headings
    for (let i = 1; i <= 6; i++) {
      await type(page, `${'#'.repeat(i)} `);
      await pressEnter(page);
    }

    const toc = await openTocPanel(page);

    await expect(toc.getByTestId('outline-block-preview-title')).toBeHidden();
    for (let i = 1; i <= 6; i++) {
      await expect(getTocHeading(toc, i)).toBeHidden();
    }
  });

  test('should update panel when modify or clear title or headings', async ({
    page,
  }) => {
    const title = await createTitle(page);
    const headings = await createHeadings(page);

    const toc = await openTocPanel(page);

    await title.scrollIntoViewIfNeeded();
    await title.click();
    await type(page, 'xxx');
    await expect(toc.getByTestId('outline-block-preview-title')).toContainText([
      'Titlexxx',
    ]);
    await selectAllByKeyboard(page);
    await pressBackspace(page);
    await expect(toc.getByTestId('outline-block-preview-title')).toBeHidden();

    for (let i = 1; i <= 6; i++) {
      await headings[i - 1].click();
      await type(page, 'xxx');
      await expect(getTocHeading(toc, i)).toContainText(`Heading ${i}xxx`);
      await selectAllByKeyboard(page);
      await pressBackspace(page);
      await expect(getTocHeading(toc, i)).toBeHidden();
    }
  });

  test('should update panel when switch doc', async ({ page }) => {
    const toc = await openTocPanel(page);
    await focusDocTitle(page);
    await page.keyboard.press('ArrowDown');
    await type(page, '# Heading 1');

    await clickNewPageButton(page);
    await expect(getTocHeading(toc, 1)).toBeHidden();
    await page.goBack();
    await expect(getTocHeading(toc, 1)).toBeVisible();
  });

  test('should add padding to sub-headings', async ({ page }) => {
    await createHeadings(page);

    const toc = await openTocPanel(page);

    let prev = getTocHeading(toc, 1);
    for (let i = 2; i <= 6; i++) {
      const curr = getTocHeading(toc, i);

      const prevRect = await prev.boundingBox();
      const currRect = await curr.boundingBox();

      expect(prevRect).not.toBeNull();
      expect(currRect).not.toBeNull();

      expect(prevRect!.x).toBeLessThan(currRect!.x);
      prev = curr;
    }
  });

  test('visibility sorting should be enabled in edgeless mode and disabled in page mode by default, and can be changed', async ({
    page,
  }) => {
    await pressEnter(page);
    await type(page, '# Heading 1');

    const toc = await openTocPanel(page);
    const sortingButton = locateSortingButton(toc);
    await expect(sortingButton).not.toHaveClass(/active/);
    await expect(toc.locator('[data-sortable="false"]')).toHaveCount(1);

    await clickEdgelessModeButton(page);
    await expect(sortingButton).toHaveClass(/active/);
    await expect(toc.locator('[data-sortable="true"]')).toHaveCount(1);

    await sortingButton.click();
    await expect(sortingButton).not.toHaveClass(/active/);
    await expect(toc.locator('[data-sortable="false"]')).toHaveCount(1);
  });

  test('should notify user when there are some page only notes and sorting is disabled', async ({
    page,
  }) => {
    await clickEdgelessModeButton(page);
    const toc = await openTocPanel(page);
    const viewportCenter = await getViewportCenter(page);
    await createEdgelessNoteBlock(page, [viewportCenter.x, viewportCenter.y]);
    const card = locateCards(toc, 'edgeless');
    await changeNoteDisplayMode(card, 'doc');

    const notification = toc.getByTestId('affine-outline-notice');
    await expect(notification).toBeHidden();

    const sortingButton = locateSortingButton(toc);
    await sortingButton.click();
    await expect(notification).toBeVisible();

    await notification.getByTestId('outline-notice-sort-button').click();
    await expect(notification).toBeHidden();
    await expect(sortingButton).toHaveClass(/active/);

    await sortingButton.click();
    await expect(notification).toBeVisible();
    await notification.getByTestId('outline-notice-close-button').click();
    await expect(notification).toBeHidden();
  });
});

test.describe('TOC and editor scroll', () => {
  test('should highlight heading when scroll to area before viewport center', async ({
    page,
  }) => {
    const title = await createTitle(page);
    for (let i = 0; i < 3; i++) {
      await pressEnter(page);
    }
    const headings = await createHeadings(page, 10);
    await title.scrollIntoViewIfNeeded();

    const toc = await openTocPanel(page);

    const viewportCenter = await getVerticalCenterFromLocator(
      page.locator('body')
    );

    const activeHeadingContainer = toc.locator(
      'affine-outline-panel-body .active'
    );

    await title.click();
    await expect(activeHeadingContainer).toContainText('Title');

    for (let i = 0; i < headings.length; i++) {
      const lastHeadingCenter = await getVerticalCenterFromLocator(headings[i]);
      await page.mouse.wheel(0, lastHeadingCenter - viewportCenter + 20);
      await page.waitForTimeout(10);

      await expect(activeHeadingContainer).toContainText(`Heading ${i + 1}`);
    }
  });

  test('should scroll to heading and highlight heading when click item in outline panel', async ({
    page,
  }) => {
    const headings = await createHeadings(page, 10);
    const toc = await openTocPanel(page);

    const activeHeadingContainer = toc.locator(
      'affine-outline-panel-body .active'
    );

    const headingsInPanel = Array.from({ length: 6 }, (_, i) =>
      getTocHeading(toc, i + 1)
    );

    await headingsInPanel[2].click();
    await expect(headings[2]).toBeVisible();
    await expect(activeHeadingContainer).toContainText('Heading 3');
  });

  test('should scroll to title when click title in outline panel', async ({
    page,
  }) => {
    const title = await createTitle(page);
    await pressEnter(page);
    await createHeadings(page, 10);

    const toc = await openTocPanel(page);

    const titleInPanel = toc.getByTestId('outline-block-preview-title');

    await expect(title).not.toBeInViewport();
    await titleInPanel.click();
    await expect(title).toBeVisible();
  });
});

test.describe('TOC and edgeless selection', () => {
  test('should select note blocks when selecting cards in TOC', async ({
    page,
  }) => {
    const toc = await openTocPanel(page);
    await clickEdgelessModeButton(page);

    const cards = locateCards(toc);

    await createEdgelessNoteBlock(page, [100, 100]);
    await changeNoteDisplayMode(cards.last(), 'doc');
    await createEdgelessNoteBlock(page, [200, 200]);

    await cards.nth(0).click();
    expect(await getEdgelessSelectedIds(page)).toHaveLength(1);
    await cards.nth(0).click();
    expect(await getEdgelessSelectedIds(page)).toHaveLength(0);

    await cards.nth(1).click();
    expect(
      await getEdgelessSelectedIds(page),
      'should not select doc only note'
    ).toHaveLength(0);

    await cards.nth(2).click();
    expect(await getEdgelessSelectedIds(page)).toHaveLength(1);
    await cards.nth(2).click();
    expect(await getEdgelessSelectedIds(page)).toHaveLength(0);

    await cards.nth(0).click({ modifiers: ['Shift'] });
    await cards.nth(1).click({ modifiers: ['Shift'] });
    await cards.nth(2).click({ modifiers: ['Shift'] });

    expect(await getEdgelessSelectedIds(page)).toHaveLength(2);
  });

  test('should select note cards when select note blocks in canvas', async ({
    page,
  }) => {
    await clickEdgelessModeButton(page);
    await setViewportCenter(page, [0, 0]);
    await selectAllByKeyboard(page);
    await pressBackspace(page);
    await createEdgelessNoteBlock(page, [100, 100]);
    await createEdgelessNoteBlock(page, [200, 200]);
    await clickView(page, [0, 0]);

    const toc = await openTocPanel(page);
    const cards = locateCards(toc);

    await clickView(page, [100, 100]);
    await expect(cards.nth(0)).toHaveAttribute('data-status', 'selected');

    await clickView(page, [200, 200]);
    await expect(cards.nth(1)).toHaveAttribute('data-status', 'selected');

    await selectAllByKeyboard(page);
    await expect(cards.nth(0)).toHaveAttribute('data-status', 'selected');
    await expect(cards.nth(1)).toHaveAttribute('data-status', 'selected');

    await pressEscape(page);
    await expect(cards.nth(0)).toHaveAttribute('data-status', 'normal');
    await expect(cards.nth(1)).toHaveAttribute('data-status', 'normal');
  });
});

test.describe('drag and drop note in outline panel', () => {
  const dragCard = async (
    from: Locator,
    to: Locator,
    position: 'before' | 'after' = 'before'
  ) => {
    const fromRect = await from.boundingBox();
    const fromCenter = {
      x: fromRect!.width / 2,
      y: fromRect!.height / 2,
    };

    const toRect = await to.boundingBox();
    const toCenter = {
      x: toRect!.width / 2,
      y: toRect!.height / 2,
    };

    await from.dragTo(to, {
      sourcePosition: fromCenter,
      targetPosition:
        position === 'before'
          ? { x: toCenter.x, y: toCenter.y - 10 }
          : { x: toCenter.x, y: toCenter.y + 10 },
    });
  };

  // create 2 both cards, 2 page cards and 2 edgeless cards
  test.beforeEach(async ({ page }) => {
    const toc = await openTocPanel(page);
    const edgelessCards = locateCards(toc, 'edgeless');

    // 2 both cards
    {
      await focusDocTitle(page);
      await page.keyboard.press('ArrowDown');
      await type(page, '0');

      await clickEdgelessModeButton(page);

      await createEdgelessNoteBlock(page, [100, 100]);
      await type(page, '1');
      await changeNoteDisplayMode(edgelessCards.first(), 'both');
    }
    // 2 page cards
    {
      await createEdgelessNoteBlock(page, [150, 150]);
      await type(page, '2');
      await changeNoteDisplayMode(edgelessCards.first(), 'doc');
      await createEdgelessNoteBlock(page, [200, 200]);
      await type(page, '3');
      await changeNoteDisplayMode(edgelessCards.first(), 'doc');
    }
    // 2 edgeless cards
    {
      await createEdgelessNoteBlock(page, [250, 250]);
      await type(page, '4');
      await createEdgelessNoteBlock(page, [300, 300]);
      await type(page, '5');
    }
  });

  test('should reorder notes when drag and drop a note in outline panel', async ({
    page,
  }) => {
    const toc = await openTocPanel(page);
    const cards = locateCards(toc);

    await dragCard(cards.nth(3), cards.nth(1));

    await clickPageModeButton(page);
    const paragraphs = page
      .locator('affine-paragraph')
      .locator('[data-v-text="true"]');
    await expect(paragraphs).toHaveCount(4);
    await expect(paragraphs.nth(0)).toContainText('0');
    await expect(paragraphs.nth(1)).toContainText('3');
    await expect(paragraphs.nth(2)).toContainText('1');
    await expect(paragraphs.nth(3)).toContainText('2');

    // Note card should be able to drag and drop in page mode
    await locateSortingButton(toc).click();
    await dragCard(cards.nth(3), cards.nth(1));

    await expect(paragraphs.nth(0)).toContainText('0');
    await expect(paragraphs.nth(1)).toContainText('2');
    await expect(paragraphs.nth(2)).toContainText('3');
    await expect(paragraphs.nth(3)).toContainText('1');
  });

  test('multiple selected note cards can be dragged and dropped at same time', async ({
    page,
  }) => {
    const toc = await openTocPanel(page);
    const cards = locateCards(toc);

    await cards.nth(2).click({ modifiers: ['Shift'] });
    await cards.nth(3).click({ modifiers: ['Shift'] });

    await dragCard(cards.nth(2), cards.nth(0));
    await clickPageModeButton(page);

    const paragraphs = page
      .locator('affine-paragraph')
      .locator('[data-v-text="true"]');

    await expect(paragraphs).toHaveCount(4);
    await expect(paragraphs.nth(0)).toContainText('2');
    await expect(paragraphs.nth(1)).toContainText('3');
    await expect(paragraphs.nth(2)).toContainText('0');
    await expect(paragraphs.nth(3)).toContainText('1');
  });
});

test.describe('advanced visibility control', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingModal(page);
    await openExperimentalFeaturesPanel(page);
    await confirmExperimentalPrompt(page);
    await page.getByTestId('enable_advanced_block_visibility').click();
    await closeSettingModal(page);
    await page.reload();
  });

  test('should update notes when change note display mode from note toolbar', async ({
    page,
  }) => {
    await clickEdgelessModeButton(page);
    await setViewportCenter(page, [0, 0]);
    await createEdgelessNoteBlock(page, [100, 100]);
    await type(page, 'hello');
    await clickView(page, [200, 200]);

    const toc = await openTocPanel(page);

    const bothCard = locateCards(toc, 'both');
    const edgelessCard = locateCards(toc, 'edgeless');

    await expect(bothCard).toHaveCount(1);
    await expect(edgelessCard).toHaveCount(1);

    await clickView(page, [100, 100]);
    const toolbar = locateToolbar(page);

    await toolbar.getByRole('button', { name: 'Mode' }).click();
    await toolbar.locator('note-display-mode-panel .item.both').click();

    await expect(bothCard).toHaveCount(2);
    await expect(edgelessCard).toHaveCount(0);
  });

  test('should update notes after slicing note', async ({ page }) => {
    await clickEdgelessModeButton(page);
    await createEdgelessNoteBlock(page, [200, 100]);
    await type(page, 'hello');
    await pressEnter(page);
    await type(page, 'world');
    await pressEscape(page, 3);
    await createEdgelessNoteBlock(page, [200, 400]);

    const toc = await openTocPanel(page);

    const bothCard = locateCards(toc, 'both');
    const edgelessCards = locateCards(toc, 'edgeless');

    await expect(bothCard).toHaveCount(1);
    await expect(edgelessCards).toHaveCount(2);

    while ((await edgelessCards.count()) > 0) {
      await edgelessCards.first().hover();
      await edgelessCards.first().getByTestId('display-mode-button').click();
      await edgelessCards
        .first()
        .locator('note-display-mode-panel .item.both')
        .click();
    }

    await expect(bothCard).toHaveCount(3);

    await clickView(page, [200, 100]);
    const toolbar = locateToolbar(page);
    await toolbar.getByRole('button', { name: 'Slicer' }).click();
    await expect(page.locator('.note-slicer-button')).toBeVisible();
    await page.locator('.note-slicer-button').click();

    await expect(bothCard).toHaveCount(4);
    await expect(
      bothCard.nth(1),
      'the sliced note card should keep the order in its parent'
    ).toContainText('hello');
    await expect(
      bothCard.nth(2),
      'the sliced note card should keep the order in its parent'
    ).toContainText('world');
  });
});
