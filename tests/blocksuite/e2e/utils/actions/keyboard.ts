import type { Page } from '@playwright/test';

const IS_MAC = process.platform === 'darwin';
// const IS_WINDOWS = process.platform === 'win32';
// const IS_LINUX = !IS_MAC && !IS_WINDOWS;

/**
 * The key will be 'Meta' on Macs and 'Control' on other platforms
 * @example
 * ```ts
 * await page.keyboard.press(`${SHORT_KEY}+a`);
 * ```
 */
export const SHORT_KEY = IS_MAC ? 'Meta' : 'Control';
/**
 * The key will be 'Alt' on Macs and 'Shift' on other platforms
 * @example
 * ```ts
 * await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+1`);
 * ```
 */
export const MODIFIER_KEY = IS_MAC ? 'Alt' : 'Shift';

export const SHIFT_KEY = 'Shift';

export async function type(page: Page, content: string, delay = 20) {
  await page.keyboard.type(content, { delay });
}

export async function withPressKey(
  page: Page,
  key: string,
  fn: () => Promise<void>
) {
  await page.keyboard.down(key);
  await fn();
  await page.keyboard.up(key);
}

export async function defaultTool(page: Page) {
  await page.keyboard.press('v', { delay: 20 });
}

export async function pressBackspace(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Backspace', { delay: 20 });
  }
}

export async function pressSpace(page: Page) {
  await page.keyboard.press('Space', { delay: 20 });
}

export async function pressArrowLeft(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowLeft', { delay: 20 });
  }
}
export async function pressArrowRight(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowRight', { delay: 20 });
  }
}

export async function pressArrowDown(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowDown', { delay: 20 });
  }
}

export async function pressArrowUp(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowUp', { delay: 20 });
  }
}

export async function pressArrowDownWithShiftKey(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(`${SHIFT_KEY}+ArrowDown`, { delay: 20 });
  }
}

export async function pressArrowUpWithShiftKey(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(`${SHIFT_KEY}+ArrowUp`, { delay: 20 });
  }
}

export async function pressEnter(page: Page, count = 1) {
  // avoid flaky test by simulate real user input
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Enter', { delay: 30 });
  }
}

export async function pressEnterWithShortkey(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+Enter`, { delay: 20 });
}

export async function pressEscape(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Escape', { delay: 20 });
  }
}

export async function undoByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+z`, { delay: 20 });
}

export async function formatType(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+1`, {
    delay: 20,
  });
}

export async function redoByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+Shift+Z`, { delay: 20 });
}

export async function selectAllByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+a`, {
    delay: 20,
  });
}

export async function selectAllBlocksByKeyboard(page: Page) {
  for (let i = 0; i < 3; i++) {
    await selectAllByKeyboard(page);
  }
}

export async function pressTab(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab', { delay: 20 });
  }
}

export async function pressShiftTab(page: Page) {
  await page.keyboard.press('Shift+Tab', { delay: 20 });
}

export async function pressBackspaceWithShortKey(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(`${SHORT_KEY}+Backspace`, { delay: 20 });
  }
}

export async function pressShiftEnter(page: Page) {
  await page.keyboard.press('Shift+Enter', { delay: 20 });
}

export async function inlineCode(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+e`, { delay: 20 });
}

export async function strikethrough(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+Shift+s`, { delay: 20 });
}

export async function copyByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+c`, { delay: 20 });
}

export async function cutByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+x`, { delay: 20 });
}

/**
 * Notice: this method will try to click closest editor by default
 */
export async function pasteByKeyboard(page: Page, forceFocus = true) {
  if (forceFocus) {
    const isEditorActive = await page.evaluate(() =>
      document.activeElement?.closest('affine-editor-container')
    );
    if (!isEditorActive) {
      await page.click('affine-editor-container');
    }
  }

  await page.keyboard.press(`${SHORT_KEY}+v`, { delay: 20 });
}

export async function createCodeBlock(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+Alt+c`);
}

export async function getCursorBlockIdAndHeight(
  page: Page
): Promise<[string | null, number | null]> {
  return page.evaluate(() => {
    const selection = window.getSelection() as Selection;

    const range = selection.getRangeAt(0);
    const startContainer =
      range.startContainer instanceof Text
        ? (range.startContainer.parentElement as HTMLElement)
        : (range.startContainer as HTMLElement);

    const startComponent = startContainer.closest(`[data-block-id]`);
    const { height } = (startComponent as HTMLElement).getBoundingClientRect();
    const id = (startComponent as HTMLElement).dataset.blockId!;
    return [id, height];
  });
}

/**
 * fill a line by keep triggering key input
 * @param page
 * @param toNext if true, fill until soft wrap
 */
export async function fillLine(page: Page, toNext = false) {
  const [id, height] = await getCursorBlockIdAndHeight(page);
  if (id && height) {
    let nextHeight;
    // type until current block height is changed, means has new line
    do {
      await page.keyboard.type('a', { delay: 20 });
      [, nextHeight] = await getCursorBlockIdAndHeight(page);
    } while (nextHeight === height);
    if (!toNext) {
      await page.keyboard.press('Backspace');
    }
  }
}

export async function pressForwardDelete(page: Page) {
  if (IS_MAC) {
    await page.keyboard.press('Control+d', { delay: 20 });
  } else {
    await page.keyboard.press('Delete', { delay: 20 });
  }
}

export async function pressForwardDeleteWord(page: Page) {
  if (IS_MAC) {
    await page.keyboard.press('Alt+Delete', { delay: 20 });
  } else {
    await page.keyboard.press('Control+Delete', { delay: 20 });
  }
}
