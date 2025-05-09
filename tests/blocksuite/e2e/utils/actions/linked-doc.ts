import { expect, type Page } from '@playwright/test';

import { pressEnter, type } from './keyboard.js';

export function getLinkedDocPopover(page: Page) {
  const REFERENCE_NODE = ' ' as const;
  const refNode = page.locator('affine-reference');
  const linkedDocPopover = page.locator('.linked-doc-popover');
  const pageBtn = linkedDocPopover.locator('.group > icon-button');

  const findRefNode = async (title: string) => {
    const refNode = page.locator(`affine-reference`, {
      has: page.locator(`.affine-reference-title[data-title="${title}"]`),
    });
    await expect(refNode).toBeVisible();
    return refNode;
  };
  const assertExistRefText = async (text: string) => {
    await expect(refNode).toBeVisible();
    const refTitleNode = refNode.locator('.affine-reference-title');
    // Since the text is in the pseudo element
    // we need to use `toHaveAttribute` to assert it.
    // And it's not a good strict way to assert the text.
    await expect(refTitleNode).toHaveAttribute('data-title', text);
  };

  const createDoc = async (
    pageType: 'LinkedPage' | 'Subpage',
    pageName?: string
  ) => {
    await type(page, '@');
    await expect(linkedDocPopover).toBeVisible();
    if (pageName) {
      await type(page, pageName);
    } else {
      pageName = 'Untitled';
    }

    await page.keyboard.press('ArrowUp');
    if (pageType === 'LinkedPage') {
      await page.keyboard.press('ArrowUp');
    }
    await pressEnter(page);
    return findRefNode(pageName);
  };

  const assertActivePageIdx = async (idx: number) => {
    if (idx !== 0) {
      await expect(pageBtn.nth(0)).toHaveAttribute('hover', 'false');
    }
    await expect(pageBtn.nth(idx)).toHaveAttribute('hover', 'true');
  };

  return {
    REFERENCE_NODE,
    linkedDocPopover,
    refNode,
    pageBtn,

    findRefNode,
    assertExistRefText,
    createLinkedDoc: async (pageName?: string) =>
      createDoc('LinkedPage', pageName),
    /**
     * @deprecated
     */
    createSubpage: async (pageName?: string) => createDoc('Subpage', pageName),
    assertActivePageIdx,
  };
}
