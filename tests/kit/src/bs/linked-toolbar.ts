import type { Page } from '@playwright/test';

export function toolbarButtons(page: Page) {
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  const switchViewBtn = toolbar.getByLabel('Switch view');
  const inlineViewBtn = toolbar.getByLabel('Inline view');
  const cardViewBtn = toolbar.getByLabel('Card view');
  const embedViewBtn = toolbar.getByLabel('Embed view');

  return {
    toolbar,
    switchViewBtn,
    inlineViewBtn,
    cardViewBtn,
    embedViewBtn,
  };
}
