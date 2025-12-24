import { type Page } from '@playwright/test';
import { AsyncLock } from '@toeverything/infra/utils';

const IS_MAC = process.platform === 'darwin';

async function keyDownCtrlOrMeta(page: Page) {
  if (IS_MAC) {
    await page.keyboard.down('Meta');
  } else {
    await page.keyboard.down('Control');
  }
}

async function keyUpCtrlOrMeta(page: Page) {
  if (IS_MAC) {
    await page.keyboard.up('Meta');
  } else {
    await page.keyboard.up('Control');
  }
}

// It's not good enough, but better than calling keyDownCtrlOrMeta and keyUpCtrlOrMeta separately
export const withCtrlOrMeta = async (page: Page, fn: () => Promise<void>) => {
  await keyDownCtrlOrMeta(page);
  await fn();
  await keyUpCtrlOrMeta(page);
};

export async function pressEnter(page: Page, count = 1) {
  // avoid flaky test by simulate real user input
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Enter', { delay: 50 });
  }
}

export async function pressArrowUp(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowUp', { delay: 50 });
  }
}

export async function pressArrowDown(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowDown', { delay: 20 });
  }
}

export async function pressTab(page: Page) {
  await page.keyboard.press('Tab', { delay: 50 });
}

export async function pressShiftTab(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab', { delay: 50 });
  await page.keyboard.up('Shift');
}

export async function pressShiftEnter(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.up('Shift');
}

export async function pressBackspace(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Backspace', { delay: 50 });
  }
}

export async function pressEscape(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Escape', { delay: 50 });
  }
}

export async function copyByKeyboard(page: Page) {
  await keyDownCtrlOrMeta(page);
  await page.keyboard.press('c', { delay: 50 });
  await keyUpCtrlOrMeta(page);
}

export async function cutByKeyboard(page: Page) {
  await keyDownCtrlOrMeta(page);
  await page.keyboard.press('x', { delay: 50 });
  await keyUpCtrlOrMeta(page);
}

export async function pasteByKeyboard(page: Page) {
  await keyDownCtrlOrMeta(page);
  await page.keyboard.press('v', { delay: 50 });
  await keyUpCtrlOrMeta(page);
}

export async function selectAllByKeyboard(page: Page) {
  await keyDownCtrlOrMeta(page);
  await page.keyboard.press('a', { delay: 50 });
  await keyUpCtrlOrMeta(page);
}

export async function undoByKeyboard(page: Page) {
  await keyDownCtrlOrMeta(page);
  await page.keyboard.press('z', { delay: 50 });
  await keyUpCtrlOrMeta(page);
}

const clipboardMutex = new AsyncLock();

export async function writeTextToClipboard(
  page: Page,
  text: string,
  paste = true
) {
  using _release = await clipboardMutex.acquire();
  // paste the url
  await page.evaluate(
    async ([text]) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      navigator.clipboard.writeText('');
      const e = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      Object.defineProperty(e, 'target', {
        writable: false,
        value: document,
      });
      e.clipboardData!.setData('text/plain', text);
      document.dispatchEvent(e);
    },
    [text]
  );
  if (paste) {
    await keyDownCtrlOrMeta(page);
    await page.keyboard.press('v', { delay: 50 });
    await keyUpCtrlOrMeta(page);
  }
}
