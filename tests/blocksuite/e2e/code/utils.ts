import type { Page } from '@playwright/test';

/**
 * @example
 * ```ts
 * const codeBlockController = getCodeBlock(page);
 * const codeBlock = codeBlockController.codeBlock;
 * ```
 */
export function getCodeBlock(page: Page) {
  const codeBlock = page.locator('affine-code');
  const languageButton = page.getByTestId('lang-button');

  const clickLanguageButton = async () => {
    await codeBlock.hover();
    await languageButton.click({ delay: 50 });
  };

  const langList = page.locator('affine-filterable-list');
  const langFilterInput = langList.locator('#filter-input');

  const codeToolbar = page.locator('affine-code-toolbar');

  const copyButton = codeToolbar.getByRole('button', { name: 'Copy code' });
  const captionButton = codeToolbar.getByRole('button', { name: 'Caption' });
  const moreButton = codeToolbar.getByRole('button', { name: 'More' });

  const menu = page.locator('.more-popup-menu');

  const openMore = async () => {
    await moreButton.click();

    const wrapButton = menu.getByRole('button', { name: 'Wrap' });
    const cancelWrapButton = menu.getByRole('button', { name: 'Cancel wrap' });
    const duplicateButton = menu.getByRole('button', { name: 'Duplicate' });
    const deleteButton = menu.getByRole('button', { name: 'Delete' });

    return {
      menu,
      wrapButton,
      cancelWrapButton,
      duplicateButton,
      deleteButton,
    };
  };

  return {
    codeBlock,
    codeToolbar,
    captionButton,
    languageButton,
    langList,
    copyButton,
    moreButton,
    langFilterInput,
    moreMenu: menu,

    openMore,
    clickLanguageButton,
  };
}
