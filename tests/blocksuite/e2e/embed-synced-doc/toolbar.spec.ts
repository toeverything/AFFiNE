import { expect } from '@playwright/test';

import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  waitNextFrame,
} from '../utils/actions';
import { getLinkedDocPopover } from '../utils/actions/linked-doc';
import { test } from '../utils/playwright';
import { initEmbedSyncedDocState } from './utils';

test.describe('embed-synced-doc toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
  });

  test('can change linked doc to embed synced doc', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const { createLinkedDoc } = getLinkedDocPopover(page);
    const linkedDoc = await createLinkedDoc('page1');
    await linkedDoc.hover();

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(toolbar).toBeVisible();

    const switchButton = toolbar.getByRole('button', { name: 'Switch view' });
    await switchButton.click();

    const embedSyncedDocBtn = toolbar.getByRole('button', {
      name: 'Embed view',
    });
    await expect(embedSyncedDocBtn).toBeVisible();

    await embedSyncedDocBtn.click();
    await waitNextFrame(page, 200);

    const embedSyncedBlock = page.locator('affine-embed-synced-doc-block');
    expect(await embedSyncedBlock.count()).toBe(1);
  });

  test('can change embed synced doc to card view', async ({ page }) => {
    await initEmbedSyncedDocState(page, [
      { title: 'Root', content: 'Hello from Root' },
      { title: 'Doc 2', content: 'Hello from Doc 2' },
    ]);

    const syncedDoc = page.locator('affine-embed-synced-doc-block');
    await syncedDoc.click();

    await waitNextFrame(page, 500);
    const toolbar = page.locator(
      // TODO(@L-Sun): simplify this selector after that toolbar widget are disabled in preview rendering is ready
      'affine-page-root > div > affine-toolbar-widget editor-toolbar'
    );
    await expect(toolbar).toBeVisible();

    const switchBtn = toolbar.getByRole('button', { name: 'Switch view' });
    await expect(switchBtn).toBeVisible();

    await switchBtn.click();
    await waitNextFrame(page, 200);

    const cardBtn = toolbar.getByRole('button', { name: 'Card view' });
    await cardBtn.click();
    await waitNextFrame(page, 200);

    const embedSyncedBlock = page.locator('affine-embed-linked-doc-block');
    expect(await embedSyncedBlock.count()).toBe(1);
  });
});
