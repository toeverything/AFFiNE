import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import {
  activeEmbed,
  clickBlockDragHandle,
  copyByKeyboard,
  dragBetweenCoords,
  dragBetweenIndices,
  dragEmbedResizeByTopLeft,
  enterPlaygroundRoom,
  focusRichText,
  getIndexCoordinate,
  getPageSnapshot,
  getRichTextBoundingBox,
  initEmptyParagraphState,
  initImageState,
  initMultipleNoteWithParagraphState,
  initParagraphsByCount,
  initThreeLists,
  initThreeParagraphs,
  pasteByKeyboard,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressForwardDelete,
  pressShiftTab,
  pressSpace,
  pressTab,
  redoByClick,
  redoByKeyboard,
  resetHistory,
  selectAllByKeyboard,
  type,
  undoByClick,
  undoByKeyboard,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertAlmostEqual,
  assertBlockCount,
  assertRichTexts,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('block level range delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await resetHistory(page);

  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left, y: box123.top - 10 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const below789 = { x: box789.right - 10, y: box789.bottom + 10 };

  await dragBetweenCoords(page, below789, above123);
  await pressBackspace(page);
  await assertBlockCount(page, 'paragraph', 0);
  await assertRichTexts(page, []);

  await waitNextFrame(page);
  await undoByClick(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await redoByClick(page);
  await assertRichTexts(page, []);
});

test('block level range delete by forwardDelete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await resetHistory(page);

  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left, y: box123.top - 10 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const below789 = { x: box789.right - 10, y: box789.bottom + 10 };

  await dragBetweenCoords(page, below789, above123);
  await pressForwardDelete(page);
  await waitNextFrame(page);
  await assertBlockCount(page, 'paragraph', 0);
  await assertRichTexts(page, []);

  await waitNextFrame(page);
  await undoByClick(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await redoByClick(page);
  await assertRichTexts(page, []);
});

// XXX: Doesn't simulate full user operation due to backspace cursor issue in Playwright.
test('select all and delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await pressBackspace(page);
  await assertBlockCount(page, 'paragraph', 0);
  await assertRichTexts(page, []);
});

test('select all and delete by forwardDelete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await pressForwardDelete(page);
  await assertBlockCount(page, 'paragraph', 0);
  await assertRichTexts(page, []);
});

test('select all should work for multiple notes in doc mode', async ({
  page,
}) => {
  const n = 4;
  await enterPlaygroundRoom(page);
  await initMultipleNoteWithParagraphState(page, undefined, n);

  await focusRichText(page, 0);
  await type(page, '123');
  await focusRichText(page, 1);
  await type(page, '456');
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(n);
});

async function clickListIcon(page: Page, i = 0) {
  const locator = page.locator('.affine-list-block__prefix').nth(i);
  await locator.click({
    force: true,
    position: {
      x: 2,
      y: 2,
    },
  });
}

test('click the list icon can select and copy', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeLists(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await clickListIcon(page, 0);
  // copy 123
  await copyByKeyboard(page);

  await focusRichText(page, 2);
  await pasteByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789123']);

  // copy 789123
  await clickListIcon(page, 2);
  await copyByKeyboard(page);

  await focusRichText(page, 0);
  await pasteByKeyboard(page);
  await assertRichTexts(page, ['123789123', '456', '789123']);
});

test('click the list icon can select and delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeLists(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await clickListIcon(page, 1);
  await waitNextFrame(page);
  await pressBackspace(page);
  await assertRichTexts(page, ['123']);
});

test('click the list icon can select and delete by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeLists(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await clickListIcon(page, 1);
  await waitNextFrame(page);
  await pressForwardDelete(page);
  await assertRichTexts(page, ['123']);
});

test('selection on heavy page', async ({ page }) => {
  await page
    .locator('body')
    .evaluate(element => (element.style.padding = '50px'));
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  for (let i = 0; i < 5; i++) {
    await type(page, `Line ${i + 1}`);
    await pressEnter(page);
  }
  const [first, last] = await page.evaluate(() => {
    const first = document.querySelector('[data-block-id="2"]');
    if (!first) {
      throw new Error();
    }

    const last = document.querySelector('[data-block-id="6"]');
    if (!last) {
      throw new Error();
    }
    return [first.getBoundingClientRect(), last.getBoundingClientRect()];
  });
  await dragBetweenCoords(
    page,
    {
      x: first.x - 1,
      y: first.y - 1,
    },
    {
      x: last.x + 1,
      y: last.y + 1,
    },
    {
      beforeMouseUp: async () => {
        const rect = await page
          .locator('.affine-page-dragging-area')
          .evaluate(element => element.getBoundingClientRect());
        assertAlmostEqual(rect.x, first.x - 1, 1);
        assertAlmostEqual(rect.y, first.y - 1, 1);
        assertAlmostEqual(rect.right, last.x + 1, 1);
        assertAlmostEqual(rect.bottom, last.y + 1, 1);
      },
    }
  );
  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(5);
});

test('should indent multi-selection block', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  const coord = await getIndexCoordinate(page, [1, 2]);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x - 26 - 24, coord.y - 10, { steps: 20 });
  await page.mouse.down();
  // ←
  await page.mouse.move(coord.x + 20, coord.y + 50, { steps: 20 });
  await page.mouse.up();

  await page.keyboard.press('Tab');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('should unindent multi-selection block', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  let coord = await getIndexCoordinate(page, [1, 2]);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x - 26 - 24, coord.y - 10, { steps: 20 });
  await page.mouse.down();
  // ←
  await page.mouse.move(coord.x + 20, coord.y + 50, { steps: 20 });
  await page.mouse.up();

  await page.keyboard.press('Tab');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  coord = await getIndexCoordinate(page, [1, 2]);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x - 26 - 50, coord.y, { steps: 20 });
  await page.mouse.down();
  // ←
  await page.mouse.move(coord.x + 20, coord.y + 30, { steps: 20 });
  await page.mouse.up();

  await pressShiftTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

// ↑
test('should keep selection state when scrolling backward', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);

  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 5 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const [, container, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance);

    const container = viewport.querySelector(
      '.affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    return [
      viewport.getBoundingClientRect(),
      container.getBoundingClientRect(),
      distance,
    ] as const;
  });

  await page.mouse.move(0, 0);
  await dragBetweenCoords(
    page,
    {
      x: container.right + 1,
      y: container.bottom,
    },
    {
      x: container.right - 1,
      y: 1,
    },
    {
      // dont release mouse
      beforeMouseUp: async () => {
        const count = distance / (10 * 0.25);
        await page.waitForTimeout((1000 / 60) * count);
      },
    }
  );

  const scrollTop = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(3 + 5 + 3);
  expect(scrollTop).toBe(0);
});

// ↓
test('should keep selection state when scrolling forward', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 5 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const [viewport, container, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    const container = viewport.querySelector(
      '.affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    return [
      viewport.getBoundingClientRect(),
      container.getBoundingClientRect(),
      distance,
    ] as const;
  });

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: container.right + 1,
      y: container.top + 1,
    },
    {
      x: container.right - 1,
      y: viewport.height - 1,
    },
    {
      // dont release mouse
      beforeMouseUp: async () => {
        const count = distance / (10 * 0.25);
        await page.waitForTimeout((1000 / 60) * count);
      },
    }
  );

  const scrollTop = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });
  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(3 + 5 + 3);
  // See https://jestjs.io/docs/expect#tobeclosetonumber-numdigits
  // Math.abs(scrollTop - distance) < Math.pow(10, -1 * -0.01)/2 = 0.511646496140377
  expect(scrollTop).toBeCloseTo(distance, -0.01);
});

// ↑
test('should keep selection state when scrolling backward with the scroll wheel', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 5 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const [last, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance);
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const last = container.lastElementChild;
    if (!last) {
      throw new Error();
    }
    return [last.getBoundingClientRect(), distance] as const;
  });
  await page.waitForTimeout(250);

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: last.right + 1,
      y: last.top + 1,
    },
    {
      x: last.right - 1,
      y: last.top - 1,
    },
    {
      // dont release mouse
      beforeMouseUp: async () => {
        await page.mouse.wheel(0, -distance * 2);
        await page.waitForTimeout(250);
      },
    }
  );

  // get count with scroll wheel
  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();
  const scrollTop0 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  await page.mouse.move(0, 0);

  await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance);
  });
  await page.waitForTimeout(250);

  await dragBetweenCoords(
    page,
    {
      x: last.right + 1,
      y: last.top + 1,
    },
    {
      x: last.right - 1,
      y: last.top - 1 - distance,
    }
  );

  // get count with moving mouse
  const count1 = await rects.count();
  const scrollTop1 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  expect(count0).toBe(count1);
  expect(scrollTop0).toBe(0);
  expect(scrollTop1).toBeCloseTo(distance, -0.5);
});

// ↓
test('should keep selection state when scrolling forward with the scroll wheel', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 5 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const [first, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    return [first.getBoundingClientRect(), distance] as const;
  });

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: first.left + 1,
      y: first.top + 1,
    },
    {
      // don't release mouse
      beforeMouseUp: async () => {
        await page.mouse.wheel(0, distance * 2);
        await page.waitForTimeout(250);
      },
    }
  );

  // get count with scroll wheel
  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();
  const scrollTop0 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  await page.mouse.move(0, 0);

  await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    viewport.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: first.left + 1,
      y: first.top + 1 + distance,
    }
  );

  // get count with moving mouse
  const count1 = await rects.count();
  const scrollTop1 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  expect(count0).toBe(count1);
  expect(scrollTop0).toBeCloseTo(distance, -0.8);
  expect(scrollTop1).toBe(0);
});

test('should not clear selected rects when clicking on scrollbar', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const [viewport, first, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance / 2);
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    return [
      viewport.getBoundingClientRect(),
      first.getBoundingClientRect(),
      distance,
    ] as const;
  });

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: first.right + 10,
      y: first.bottom + distance / 2,
    }
  );

  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();
  const scrollTop0 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  await page.mouse.click(viewport.right, distance / 2);

  const count1 = await rects.count();
  const scrollTop1 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  expect(count0).toBeGreaterThan(0);
  expect(scrollTop0).toBeCloseTo(distance / 2, -0.01);
  expect(count0).toBe(count1);
  expect(scrollTop0).toBeCloseTo(scrollTop1, -0.01);
});

test('should not clear selected rects when scrolling the wheel', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const [viewport, first, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance / 2);
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    return [
      viewport.getBoundingClientRect(),
      first.getBoundingClientRect(),
      distance,
    ] as const;
  });

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: first.right + 10,
      y: first.bottom + distance / 2,
    }
  );

  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();

  await page.mouse.wheel(viewport.right, -distance / 4);
  await waitNextFrame(page);

  const count1 = await rects.count();

  expect(count0).toBeGreaterThan(0);
  expect(count0).toBe(count1);

  await page.mouse.wheel(viewport.right, distance / 4);
  await waitNextFrame(page);

  const count2 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const rects = viewport.querySelectorAll('affine-block-selection');
    const visibleRects = Array.from(rects).filter(rect => {
      const display = window.getComputedStyle(rect).display;
      return display !== 'none';
    });
    return visibleRects.length;
  });

  expect(count0).toBe(count2);
});

test('should refresh selected rects when resizing the window/viewport', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 6; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const [viewport, first, distance] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance / 2);
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    return [
      viewport.getBoundingClientRect(),
      first.getBoundingClientRect(),
      distance,
    ] as const;
  });

  await page.mouse.move(0, 0);

  await dragBetweenCoords(
    page,
    {
      x: first.left - 1,
      y: first.top - 1,
    },
    {
      x: first.left + 1,
      y: first.top + distance / 2,
    }
  );

  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();
  const scrollTop0 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  await page.mouse.click(viewport.right, first.top + distance / 2);

  const size = page.viewportSize();

  if (!size) {
    throw new Error();
  }

  await page.setViewportSize({
    width: size.width - 100,
    height: size.height - 100,
  });
  await page.waitForTimeout(250);

  const count1 = await rects.count();
  const scrollTop1 = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    return viewport.scrollTop;
  });

  expect(count0).toBe(count1);
  expect(scrollTop0).toBeCloseTo(scrollTop1, -0.01);
});

test('should clear block selection before native selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  // `123`
  const first = await page.evaluate(() => {
    const first = document.querySelector('[data-block-id="2"]');
    if (!first) {
      throw new Error();
    }
    return first.getBoundingClientRect();
  });

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: first.left + 1,
      y: first.top + 1,
    }
  );

  const rects = page.locator('affine-block-selection').locator('visible=true');
  const count0 = await rects.count();

  await dragBetweenIndices(
    page,
    [1, 3],
    [1, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  );

  const count1 = await rects.count();
  const textCount = await page.evaluate(() => {
    return window.getSelection()?.rangeCount || 0;
  });

  expect(count0).toBe(1);
  expect(count1).toBe(0);
  expect(textCount).toBe(1);
});

test('should not be misaligned when the editor container has padding or margin', async ({
  page,
}) => {
  await page.locator('body').evaluate(element => {
    element.style.margin = '50px';
    element.style.padding = '50px';
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  // `123`, `789`
  const [first, last] = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    const last = container.lastElementChild;
    if (!last) {
      throw new Error();
    }
    return [first.getBoundingClientRect(), last.getBoundingClientRect()];
  });

  await dragBetweenCoords(
    page,
    {
      x: first.left - 10,
      y: first.top - 10,
    },
    {
      x: last.left + 1,
      y: last.top + 1,
    }
  );

  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(3);
});

test('undo should clear block selection', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');
  await pressEnter(page);

  const rect = await getRichTextBoundingBox(page, '2');
  await dragBetweenCoords(
    page,
    { x: rect.x - 5, y: rect.y - 5 },
    { x: rect.x + 5, y: rect.y + rect.height }
  );

  await redoByKeyboard(page);
  const selectedBlocks = page
    .locator('affine-block-selection')
    .locator('visible=true');
  await expect(selectedBlocks).toHaveCount(1);

  await undoByKeyboard(page);
  await expect(selectedBlocks).toHaveCount(0);
});

test('should not draw rect for sub selected blocks when entering tab key', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  const coord = await getIndexCoordinate(page, [1, 3]);

  // blur
  await page.mouse.click(20, 20);

  await dragBetweenCoords(
    page,
    { x: coord.x - 60, y: coord.y + 10 },
    { x: coord.x + 100, y: coord.y + 30 },
    { steps: 50 }
  );

  await pressTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('should blur rich-text first on starting block selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await expect(page.locator('[contenteditable="true"]:focus')).toHaveCount(1);

  const coord = await getIndexCoordinate(page, [1, 2]);
  await dragBetweenCoords(
    page,
    { x: coord.x - 30, y: coord.y - 10 },
    { x: coord.x + 20, y: coord.y + 50 }
  );

  await expect(page.locator('[contenteditable="true"]:focus')).toHaveCount(0);
});

test('should show toolbar of image on block selection', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initImageState(page);
  await activeEmbed(page);

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  await expect(toolbar).toBeHidden();

  await pressEnter(page);

  const imageRect = await page.locator('affine-image').boundingBox();
  if (!imageRect) {
    throw new Error();
  }

  await dragBetweenCoords(
    page,
    {
      x: imageRect.x + imageRect.width + 60,
      y: imageRect.y + imageRect.height / 2 + 10,
    },
    {
      x: imageRect.x - 100,
      y: imageRect.y + imageRect.height / 2,
    }
  );

  await page.waitForTimeout(50);

  await expect(toolbar).toBeVisible();
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(1);
});

test('click bottom of page and if the last is embed block, editor should insert a new editable block', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initImageState(page);
  await activeEmbed(page);
  await dragEmbedResizeByTopLeft(page);

  const hostRect = await page.evaluate(() => {
    const host = document.querySelector('editor-host');
    if (!host) {
      throw new Error("Can't find doc viewport");
    }
    return host.getBoundingClientRect();
  });

  await page.mouse.click(hostRect.x + hostRect.width / 2, hostRect.bottom - 10);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('should select blocks when pressing escape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await focusRichText(page, 2);
  await page.keyboard.press('Escape');
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(1);
  await page.keyboard.press('Escape');

  const cords = await getIndexCoordinate(page, [1, 2]);
  await page.mouse.move(cords.x + 10, cords.y + 10, { steps: 20 });
  await page.mouse.down();
  await page.mouse.move(cords.x + 20, cords.y + 30, { steps: 20 });
  await page.mouse.up();

  await page.keyboard.press('Escape');
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(1);
});

test('should un-select blocks when pressing escape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await focusRichText(page, 2);
  await pressEscape(page);
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(1);

  await pressEscape(page);
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(0);

  await focusRichText(page, 2);
  await pressEnter(page);
  await type(page, '-');
  await pressSpace(page);
  await clickListIcon(page, 0);
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(1);

  await pressEscape(page);
  await expect(
    page.locator('affine-block-selection').locator('visible=true')
  ).toHaveCount(0);
});

test('verify cursor position after changing block type', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  const anchorOffset = await page.evaluate(() => {
    return window.getSelection()?.anchorOffset || 0;
  });
  expect(anchorOffset).toBe(5);

  await type(page, '/');
  const slashMenu = page.locator(`.slash-menu`);
  await expect(slashMenu).toBeVisible();

  const todayBlock = page.getByTestId('Heading 1');
  await todayBlock.click();
  await expect(slashMenu).toBeHidden();

  await type(page, 'w');
  const anchorOffset2 = await page.evaluate(() => {
    return window.getSelection()?.anchorOffset || 0;
  });
  expect(anchorOffset2).toBe(6);
});

// https://github.com/toeverything/blocksuite/issues/3613
test('should scroll page properly by wheel after inserting a new block and selecting it', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await test.step('Insert enough blocks to make page scrollable', async () => {
    await focusRichText(page);

    for (let i = 0; i < 10; i++) {
      await type(page, String(i));
      await pressEnter(page);
      await pressEnter(page);
    }
  });

  await type(page, 'new block');

  const lastBlockId = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport')!;
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    const last = container!.lastElementChild as HTMLElement;
    if (!last) {
      throw new Error();
    }
    return last.dataset.blockId!;
  });

  // click drag handle to select block
  await clickBlockDragHandle(page, lastBlockId);

  async function getViewportScrollTop() {
    return page.evaluate(() => {
      const viewport = document.querySelector('.affine-page-viewport');
      if (!viewport) {
        throw new Error();
      }
      return viewport.scrollTop;
    });
  }
  await page.mouse.move(0, 0);
  // scroll to top by wheel
  await page.mouse.wheel(0, -(await getViewportScrollTop()) * 2);
  await page.waitForTimeout(250);
  expect(await getViewportScrollTop()).toBe(0);

  // scroll to end by wheel
  const distanceToEnd = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport')!;
    return viewport.scrollHeight - viewport.clientHeight;
  });
  await page.mouse.wheel(0, distanceToEnd * 2);
  await page.waitForTimeout(250);
  expect(await getViewportScrollTop()).toBe(distanceToEnd);
});

test('should not select parent block when dragging area only intersects with child', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const coord = await getIndexCoordinate(page, [1, 2]);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x - 26 - 24, coord.y - 10, { steps: 20 });
  await page.mouse.down();
  // ←
  await page.mouse.move(coord.x + 20, coord.y + 50, { steps: 20 });
  await page.mouse.up();

  let rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(2);

  // indent children blocks
  await pressTab(page);

  const secondCoord = await getIndexCoordinate(page, [1, 2]);
  await page.mouse.click(0, 0);
  await page.mouse.move(secondCoord.x - 100, secondCoord.y - 10, {
    steps: 20,
  });
  await page.mouse.down();
  // ←
  await page.mouse.move(secondCoord.x + 100, secondCoord.y + 10, { steps: 20 });
  await page.mouse.up();

  rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(1);
});

test('scroll should update dragging area and select blocks when dragging', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initParagraphsByCount(page, 20);

  await page.mouse.click(0, 0);
  // eslint-disable-next-line sonarjs/no-identical-functions
  async function getViewportScrollTop() {
    return page.evaluate(() => {
      const viewport = document.querySelector('.affine-page-viewport');
      if (!viewport) {
        throw new Error();
      }
      return viewport.scrollTop;
    });
  }

  await page.mouse.wheel(0, -(await getViewportScrollTop()) * 2);
  await page.waitForTimeout(250);
  expect(await getViewportScrollTop()).toBe(0);

  const coord = await getIndexCoordinate(page, [1, 1]);

  await page.mouse.move(coord.x - 26 - 24, coord.y - 30, { steps: 40 });
  await waitNextFrame(page, 300);
  await page.mouse.down();
  await waitNextFrame(page, 300);
  await page.mouse.move(coord.x + 100, coord.y + 10, { steps: 40 });
  await waitNextFrame(page, 300);

  let rects = page.locator('affine-block-selection').locator('visible=true');
  expect(await rects.count()).toBeGreaterThan(0);

  // scroll to end by wheel
  const distanceToEnd = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport')!;
    return viewport.scrollHeight - viewport.clientHeight;
  });
  await page.mouse.wheel(0, distanceToEnd * 2);
  await page.waitForTimeout(250);
  expect(await getViewportScrollTop()).toBe(distanceToEnd);

  await page.mouse.up();

  rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(3);
});
