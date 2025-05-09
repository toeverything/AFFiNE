import { expect } from '@playwright/test';

import { switchReadonly } from '../utils/actions/click.js';
import {
  pressBackspace,
  pressEnter,
  pressTab,
  type,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  focusRichTextEnd,
  initEmptyCodeBlockState,
} from '../utils/actions/misc.js';
import { assertRichTexts } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import { getCodeBlock } from './utils.js';

test('should code block widget be disabled in read only mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichTextEnd(page);

  await page.waitForTimeout(300);
  await switchReadonly(page);

  const codeBlockController = getCodeBlock(page);
  const codeBlock = codeBlockController.codeBlock;
  await codeBlock.hover();
  await codeBlockController.clickLanguageButton();
  await expect(codeBlockController.langList).toBeHidden();

  await codeBlock.hover();
  await expect(codeBlockController.codeToolbar).toBeVisible();
  await expect(codeBlockController.moreButton).toHaveAttribute('disabled');

  await expect(codeBlockController.copyButton).toBeVisible();
  await expect(codeBlockController.moreMenu).toBeHidden();
});

test('should not be able to modify code block in readonly mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'const a = 10;');
  await assertRichTexts(page, ['const a = 10;']);

  await switchReadonly(page);
  await pressBackspace(page, 3);
  await pressTab(page, 3);
  await pressEnter(page, 2);
  await assertRichTexts(page, ['const a = 10;']);
});
