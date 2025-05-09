import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  pasteContent,
  pressArrowDown,
  pressArrowUp,
  pressEscape,
  waitEmbedLoaded,
} from '../utils/actions/index.js';
import { assertRichImage, assertText } from '../utils/asserts.js';
import { scoped, test } from '../utils/playwright.js';

test(
  scoped`clipboard paste end with image, the cursor should be controlled by up/down keys`,
  async ({ page }) => {
    test.info().annotations.push({
      type: 'issue',
      description: 'https://github.com/toeverything/blocksuite/issues/3639',
    });
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    // set up clipboard data using html
    const clipData = {
      'text/html': `<p>Lorem Ipsum placeholder text.</p>
    <figure ><img src='https://placehold.co/600x400' /></figure>
    `,
    };
    await page.evaluate(
      ({ clipData }) => {
        const dT = new DataTransfer();
        const e = new ClipboardEvent('paste', { clipboardData: dT });
        Object.defineProperty(e, 'target', {
          writable: false,
          value: document,
        });
        e.clipboardData?.setData('text/html', clipData['text/html']);
        document.dispatchEvent(e);
      },
      { clipData }
    );
    const str = 'Lorem Ipsum placeholder text.';
    await waitEmbedLoaded(page);
    await assertRichImage(page, 1);
    await pressEscape(page);
    await pressArrowUp(page, 1);
    await pasteContent(page, clipData);
    await assertRichImage(page, 2);
    await assertText(page, str + str);
    await pressArrowDown(page, 1);
    await pressEscape(page);
    await pasteContent(page, clipData);
    await assertRichImage(page, 3);
    await assertText(page, 'Lorem Ipsum placeholder text.', 1);
  }
);
