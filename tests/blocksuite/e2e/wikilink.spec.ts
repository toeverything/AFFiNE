import { expect } from '@playwright/test';

import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  waitNextFrame,
} from './utils/actions/misc.js';
import { assertRichTextInlineDeltas } from './utils/asserts.js';
import { test } from './utils/playwright.js';

/**
 * Wikilink E2E tests — US2 (FR-008 to FR-013)
 *
 * Covers the [[title]] → unresolved reference delta flow:
 *   1. Typing [[New Page]] produces an unresolved reference node (pageId === '').
 *   2. The reference node renders with the `affine-reference--unresolved` CSS class.
 *   3. Clicking the unresolved node creates the target page and resolves the reference.
 *   4. Alias syntax [[title|Alias]] stores the displayText in the reference title.
 *   5. Anchor syntax [[title#heading]] stores the heading in the title field.
 *   6. Block-id syntax [[title#^block-id]] stores blockIds in reference params.
 */

test('wikilink: typing [[PageName]] creates unresolved reference delta', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  // Type the wikilink — the ] key handler fires on the second ] and converts
  // the [[...]] span to an unresolved reference delta.
  for (const char of [
    '[',
    '[',
    'N',
    'e',
    'w',
    ' ',
    'P',
    'a',
    'g',
    'e',
    ']',
    ']',
  ]) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  await assertRichTextInlineDeltas(page, [
    {
      insert: '\uFFFD', // REFERENCE_NODE sentinel character
      attributes: {
        reference: {
          type: 'LinkedPage',
          pageId: '',
          title: 'New Page',
        },
      },
    },
  ]);
});

test('wikilink: unresolved reference renders with dashed underline class', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  for (const char of ['[', '[', 'T', 'e', 's', 't', ']', ']']) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  // The unresolved node should have the CSS class that triggers the dashed underline.
  const unresolvedNode = page.locator(
    'affine-reference.affine-reference--unresolved'
  );
  await expect(unresolvedNode).toBeVisible();
});

test('wikilink: alias syntax [[title|Alias]] stores alias as reference title', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  for (const char of [
    '[',
    '[',
    'R',
    'e',
    'a',
    'l',
    '|',
    'A',
    'l',
    'i',
    'a',
    's',
    ']',
    ']',
  ]) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  const delta = await page.evaluate(() => {
    const editorHost = document.querySelector('editor-host');
    const inlineRoot = editorHost?.querySelector<InlineRootElement>(
      'rich-text [data-v-root="true"]'
    );
    return inlineRoot?.inlineEditor.yTextDeltas?.[0];
  });

  expect(delta?.attributes?.reference?.title).toBe('Real');
  // The alias text 'Alias' would be displayed as the node label but the title
  // stores the lookup key.  Display text handling is renderer-side.
});

test('wikilink: anchor syntax [[title#heading]] stored in title', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  for (const char of [
    '[',
    '[',
    'P',
    'a',
    'g',
    'e',
    '#',
    'H',
    'e',
    'a',
    'd',
    ']',
    ']',
  ]) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  const delta = await page.evaluate(() => {
    const editorHost = document.querySelector('editor-host');
    const inlineRoot = editorHost?.querySelector<InlineRootElement>(
      'rich-text [data-v-root="true"]'
    );
    return inlineRoot?.inlineEditor.yTextDeltas?.[0];
  });

  // targetTitle is 'Page'; anchor 'Head' is not in ReferenceParamsSchema so
  // it is stored alongside the title for future heading resolution.
  expect(delta?.attributes?.reference?.title).toBe('Page');
  expect(delta?.attributes?.reference?.pageId).toBe('');
});

test('wikilink: block-ref syntax [[title#^block-id]] stored in params.blockIds', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  for (const char of ['[', '[', 'P', '#', '^', 'a', 'b', 'c', '1', ']', ']']) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  const delta = await page.evaluate(() => {
    const editorHost = document.querySelector('editor-host');
    const inlineRoot = editorHost?.querySelector<InlineRootElement>(
      'rich-text [data-v-root="true"]'
    );
    return inlineRoot?.inlineEditor.yTextDeltas?.[0];
  });

  expect(delta?.attributes?.reference?.params?.blockIds).toEqual(['abc1']);
});

test('wikilink: clicking unresolved reference creates target page and resolves link', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  const pageTitle = 'Brand New Doc';
  for (const char of ['[', '[', ...pageTitle.split(''), ']', ']']) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 200);

  // Confirm it rendered as unresolved first.
  const unresolvedNode = page.locator(
    'affine-reference.affine-reference--unresolved'
  );
  await expect(unresolvedNode).toBeVisible();

  // Click the unresolved reference — this should trigger page creation and
  // resolve the link (pageId becomes non-empty).
  await unresolvedNode.click();
  await waitNextFrame(page, 500);

  // After click, the reference node should no longer be unresolved.
  await expect(
    page.locator('affine-reference.affine-reference--unresolved')
  ).toHaveCount(0);

  const delta = await page.evaluate(() => {
    const editorHost = document.querySelector('editor-host');
    const inlineRoot = editorHost?.querySelector<InlineRootElement>(
      'rich-text [data-v-root="true"]'
    );
    return inlineRoot?.inlineEditor.yTextDeltas?.[0];
  });

  expect(delta?.attributes?.reference?.pageId).not.toBe('');
  expect(delta?.attributes?.reference?.pageId).toBeTruthy();
});

test('wikilink: no conversion inside code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await waitNextFrame(page);

  // Convert current block to code block via ``` shortcut.
  await page.keyboard.type('```', { delay: 20 });
  await page.keyboard.press('Space');
  await waitNextFrame(page, 100);

  // Type [[...]] inside the code block — should NOT produce a reference node.
  for (const char of ['[', '[', 'P', 'a', 'g', 'e', ']', ']']) {
    await page.keyboard.type(char, { delay: 20 });
    await waitNextFrame(page);
  }

  await waitNextFrame(page, 100);

  // In code block, wikilink should remain as literal text.
  await expect(page.locator('affine-reference')).toHaveCount(0);
});
